'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const { createService } = require('../src/service.cjs');
const { LocalD1 } = require('./sqlite-d1.cjs');
const { options: core02Options } = require('./fixtures.cjs');
const {
  DEFAULT_SHA256,
  DEFAULT_SITE_ID,
  handlePracticeApiRequest,
  sha256Hex,
} = require('../src/http-edge.cjs');

const root = path.resolve(__dirname, '..');
const migrationSql = fs.readFileSync(
  path.join(root, 'drizzle', '0000_sour_miracleman.sql'),
  'utf8'
);
const seedContentSql = fs.readFileSync(
  path.join(root, 'scripts', 'seed-draft-content.sql'),
  'utf8'
);

function createMigratedD1(options = {}) {
  const baseD1 = new LocalD1(':memory:');
  // Strip Drizzle statement-breakpoint comments if needed (SQLite ignores -- comments)
  baseD1.sqlite.exec(migrationSql);
  if (options.seedContent !== false) {
    baseD1.sqlite.exec(seedContentSql);
  }
  let sessionCount = 0;
  return {
    sqlite: baseD1.sqlite,
    get failAfter() {
      return baseD1.failAfter;
    },
    set failAfter(v) {
      baseD1.failAfter = v;
    },
    prepare: (...args) => baseD1.prepare(...args),
    batch: (...args) => baseD1.batch(...args),
    withSession(constraint) {
      sessionCount += 1;
      return {
        sessionTag: `d1_session_${sessionCount}_${constraint}`,
        prepare: (...args) => baseD1.prepare(...args),
        batch: (...args) => baseD1.batch(...args),
      };
    },
    getSessionCount: () => sessionCount,
    close: () => baseD1.close(),
  };
}

describe('EXAM-CORE-03 Migration & Domain Service Integration', () => {
  it('M-01 Drizzle migration is schema-only (zero rows in all 8 tables)', () => {
    const db = createMigratedD1({ seedContent: false });
    try {
      const tables = [
        'principals',
        'role_grants',
        'learner_profiles',
        'content_versions',
        'practice_sessions',
        'practice_events',
        'step_progress',
        'audit_receipts',
      ];
      for (const table of tables) {
        const row = db.sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
        assert.equal(row.c, 0, `Expected 0 rows in ${table} after migration`);
      }
    } finally {
      db.close();
    }
  });

  it('M-02 Separate content seed registers EXAM-RAD-01 as DRAFT (never APPROVED)', () => {
    const db = createMigratedD1({ seedContent: true });
    try {
      const pkg = db.sqlite
        .prepare(
          "SELECT * FROM content_versions WHERE package_id = 'EXAM-RAD-01' AND version = '0.1.0-DRAFT'"
        )
        .get();
      assert.ok(pkg);
      assert.equal(pkg.review_state, 'DRAFT');
      assert.equal(pkg.validator_version, 'radicals-engine:rad04');
      assert.equal(pkg.sha256, DEFAULT_SHA256);
    } finally {
      db.close();
    }
  });

  it('M-03 Drizzle-migrated DB passes idempotency, revision conflict, and atomic rollback invariants', async () => {
    const db = createMigratedD1({ seedContent: true });
    try {
      // Provision verified operator explicitly outside migration
      db.sqlite
        .prepare('INSERT INTO principals VALUES (?,?,?,?,?)')
        .run('p_op1', DEFAULT_SITE_ID, 'usr_real_op_1', 'ACTIVE', '2026-10-16T00:00:00Z');
      db.sqlite
        .prepare('INSERT INTO learner_profiles VALUES (?,?,?)')
        .run('l_op1', 'p_op1', 'ACTIVE');
      db.sqlite
        .prepare('INSERT INTO role_grants VALUES (?,?,?,?,?,?,NULL)')
        .run(
          'g_op1',
          'p_op1',
          'pilot_operator',
          'site',
          DEFAULT_SITE_ID,
          'explicit-operator-provisioning'
        );

      const svc = await createService(db, {
        ...core02Options,
        siteId: DEFAULT_SITE_ID,
      });
      const actor = { subject: 'usr_real_op_1' };

      const s = await svc.createSession(actor, {
        client_event_id: 'create_m03_1',
        package_id: 'EXAM-RAD-01',
        version: '0.1.0-DRAFT',
        sha256: DEFAULT_SHA256,
        item_id: 'RAD-001',
      });
      assert.equal(s.revision, 0);

      // 1. Submit event and get receipt
      const r1 = await svc.submit(actor, s.session_id, {
        client_event_id: 'evt_m03_1',
        expected_revision: 0,
        type: 'ANSWER_SUBMITTED',
        step_id: 'RAD-001:S01',
        answer: '3',
      });
      assert.equal(r1.revision, 1);
      assert.equal(r1.result_status, 'CORRECT');

      // 2. Duplicate client_event_id + identical payload returns exact same receipt
      const r1Dup = await svc.submit(actor, s.session_id, {
        client_event_id: 'evt_m03_1',
        expected_revision: 0,
        type: 'ANSWER_SUBMITTED',
        step_id: 'RAD-001:S01',
        answer: '3',
      });
      assert.deepEqual(r1Dup, r1);

      // 3. Same client_event_id + different payload rejected with 409 EVENT_ID_CONFLICT
      await assert.rejects(
        () =>
          svc.submit(actor, s.session_id, {
            client_event_id: 'evt_m03_1',
            expected_revision: 1,
            type: 'ANSWER_SUBMITTED',
            step_id: 'RAD-001:S01',
            answer: '9',
          }),
        (err) => err.status === 409 && err.code === 'EVENT_ID_CONFLICT'
      );

      // 4. Stale revision rejected with 409 REVISION_CONFLICT
      await assert.rejects(
        () =>
          svc.submit(actor, s.session_id, {
            client_event_id: 'evt_m03_stale',
            expected_revision: 0,
            type: 'HINT_OPENED',
            step_id: 'RAD-001:S02',
          }),
        (err) => err.status === 409 && err.code === 'REVISION_CONFLICT'
      );

      // 5. Mid-transaction failure leaves zero partial writes
      db.failAfter = 1;
      await assert.rejects(() =>
        svc.submit(actor, s.session_id, {
          client_event_id: 'evt_m03_fail',
          expected_revision: 1,
          type: 'HINT_OPENED',
          step_id: 'RAD-001:S02',
        })
      );
      db.failAfter = null;
      const resumed = await svc.resume(actor, s.session_id);
      assert.equal(resumed.revision, 1);
    } finally {
      db.close();
    }
  });
});

describe('EXAM-CORE-03 HTTP Edge Security, Identity, CSRF & Bounds', () => {
  const OWNER_SUB = 'usr_verified_owner_88192';

  function callApi(db, request, user, extra = {}) {
    return handlePracticeApiRequest({
      request,
      db,
      user,
      siteId: DEFAULT_SITE_ID,
      pilotOperatorSubject: OWNER_SUB,
      forbidSyntheticSubjects: true,
      ...extra,
    });
  }

  it('H-01 Rejects unauthenticated requests (401 AUTH_REQUIRED) and service-token-only requests across all 4 routes', async () => {
    const db = createMigratedD1();
    try {
      const r1 = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
            'x-service-token': 'svc_secret_token',
          },
          body: JSON.stringify({
            client_event_id: 'ce_1',
            package_id: 'EXAM-RAD-01',
            version: '0.1.0-DRAFT',
            sha256: DEFAULT_SHA256,
            item_id: 'RAD-001',
          }),
        }),
        null
      );
      assert.equal(r1.status, 401);
      assert.equal(r1.headers.get('cache-control'), 'private, no-store');
      assert.equal((await r1.json()).error, 'AUTH_REQUIRED');

      const r2 = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions/ps_123/events', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_event_id: 'ce_2',
            expected_revision: 0,
            type: 'ITEM_RESET',
            step_id: null,
          }),
        }),
        null
      );
      assert.equal(r2.status, 401);

      const r3 = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions/ps_123'),
        null
      );
      assert.equal(r3.status, 401);

      const r4 = await callApi(
        db,
        new Request('https://site.example/api/me/progress'),
        null
      );
      assert.equal(r4.status, 401);
    } finally {
      db.close();
    }
  });

  it('H-02 Rejects synthetic test identities (A/B/S/T/P) and workspace project_id in hosted mode', async () => {
    const db = createMigratedD1();
    try {
      for (const syntheticId of ['A', 'B', 'S', 'T', 'P', DEFAULT_SITE_ID]) {
        const res = await callApi(
          db,
          new Request('https://site.example/api/me/progress'),
          { userId: syntheticId, email: 'test@example.com', name: 'Test' }
        );
        assert.equal(
          res.status,
          403,
          `Expected 403 for forbidden identity ${syntheticId}`
        );
      }
    } finally {
      db.close();
    }
  });

  it('H-03 Rejects spoofed learner_id, role, email, or account_id in headers, query, or body (400)', async () => {
    const db = createMigratedD1();
    try {
      const user = {
        userId: OWNER_SUB,
        email: 'owner@example.com',
        name: 'Owner',
      };

      // Spoofed header
      const rHeader = await callApi(
        db,
        new Request('https://site.example/api/me/progress', {
          headers: { 'x-user-role': 'pilot_operator' },
        }),
        user
      );
      assert.equal(rHeader.status, 400);

      // Spoofed query param
      const rQuery = await callApi(
        db,
        new Request('https://site.example/api/me/progress?learner_id=lB'),
        user
      );
      assert.equal(rQuery.status, 400);

      // Spoofed JSON body field
      const rBody = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_event_id: 'ce_spoof',
            package_id: 'EXAM-RAD-01',
            version: '0.1.0-DRAFT',
            sha256: DEFAULT_SHA256,
            item_id: 'RAD-001',
            learner_id: 'l_spoof',
          }),
        }),
        user
      );
      assert.equal(rBody.status, 400);
    } finally {
      db.close();
    }
  });

  it('H-04 Enforces CSRF / Same-Origin (403), JSON Content-Type (415), and 16 KiB request size cap (413)', async () => {
    const db = createMigratedD1();
    try {
      const user = {
        userId: OWNER_SUB,
        email: 'owner@example.com',
        name: 'Owner',
      };

      // Cross-origin Origin header
      const rCrossOrigin = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://evil.example',
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
        user
      );
      assert.equal(rCrossOrigin.status, 403);

      // Cross-site Sec-Fetch-Site
      const rCrossSite = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            'Sec-Fetch-Site': 'cross-site',
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
        user
      );
      assert.equal(rCrossSite.status, 403);

      // Missing Origin, Sec-Fetch-Site, and Referer on POST
      const rNoOrigin = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        user
      );
      assert.equal(rNoOrigin.status, 403);

      // Non-JSON Content-Type
      const rForm = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'text/plain',
          },
          body: '{}',
        }),
        user
      );
      assert.equal(rForm.status, 415);

      // Streaming body > 16 KiB
      const oversizedBody = JSON.stringify({
        client_event_id: 'ce_big',
        package_id: 'EXAM-RAD-01',
        version: '0.1.0-DRAFT',
        sha256: DEFAULT_SHA256,
        item_id: 'RAD-001',
        pad: 'x'.repeat(17000),
      });
      const rTooLarge = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: oversizedBody,
        }),
        user
      );
      assert.equal(rTooLarge.status, 413);
      assert.equal((await rTooLarge.json()).error, 'TOO_LARGE');
    } finally {
      db.close();
    }
  });

  it('H-05 Never grants first-visitor-admin; requires verified operator configuration and creates per-request D1 sessions', async () => {
    const db = createMigratedD1();
    try {
      // 1. Unconfigured operator env -> first visitor does NOT get pilot_operator and gets 403 NOT_ENROLLED
      const rFirstVisitor = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_event_id: 'ce_fv',
            package_id: 'EXAM-RAD-01',
            version: '0.1.0-DRAFT',
            sha256: DEFAULT_SHA256,
            item_id: 'RAD-001',
          }),
        }),
        { userId: 'usr_first_visitor_1', email: 'fv@example.com', name: 'FV' },
        { pilotOperatorSubject: null }
      );
      assert.equal(rFirstVisitor.status, 403);

      // 2. Verified owner subject_id succeeds and gets per-request D1 session + x-yd-account-scope header
      const sessionsBefore = db.getSessionCount();
      const ownerUser = {
        userId: OWNER_SUB,
        email: 'owner@example.com',
        name: 'Owner',
      };
      const rOwnerCreate = await callApi(
        db,
        new Request('https://site.example/api/practice/sessions', {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_event_id: 'ce_owner_create',
            package_id: 'EXAM-RAD-01',
            version: '0.1.0-DRAFT',
            sha256: DEFAULT_SHA256,
            item_id: 'RAD-001',
          }),
        }),
        ownerUser
      );
      assert.equal(rOwnerCreate.status, 200);
      assert.equal(db.getSessionCount(), sessionsBefore + 1);
      const expectedScope = (
        await sha256Hex(`${DEFAULT_SITE_ID}:${OWNER_SUB}`)
      ).slice(0, 24);
      assert.equal(rOwnerCreate.headers.get('x-yd-account-scope'), expectedScope);
      const created = await rOwnerCreate.json();

      // Submit event, resume, and check progress via HTTP handlers
      const rOwnerEvent = await callApi(
        db,
        new Request(
          `https://site.example/api/practice/sessions/${created.session_id}/events`,
          {
            method: 'POST',
            headers: {
              Origin: 'https://site.example',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_event_id: 'ce_http_1',
              expected_revision: 0,
              type: 'ANSWER_SUBMITTED',
              step_id: 'RAD-001:S01',
              answer: '3',
            }),
          }
        ),
        ownerUser
      );
      assert.equal(rOwnerEvent.status, 200);
      const evBody = await rOwnerEvent.json();
      assert.equal(evBody.revision, 1);
      assert.equal(evBody.result_status, 'CORRECT');

      const rOwnerResume = await callApi(
        db,
        new Request(
          `https://site.example/api/practice/sessions/${created.session_id}`
        ),
        ownerUser
      );
      assert.equal(rOwnerResume.status, 200);
      const resumed = await rOwnerResume.json();
      assert.equal(resumed.revision, 1);
      assert.equal(resumed.state.answers['RAD-001:S01'], '3');

      const rOwnerProg = await callApi(
        db,
        new Request('https://site.example/api/me/progress'),
        ownerUser
      );
      assert.equal(rOwnerProg.status, 200);
      const prog = await rOwnerProg.json();
      assert.equal(prog.sessions.length, 1);
      assert.equal(prog.sessions[0].session_id, created.session_id);
    } finally {
      db.close();
    }
  });

  it('H-06 Sanitizes 500 INTERNAL_ERROR responses and never logs student answer payloads', async () => {
    const brokenDb = {
      withSession() {
        return {
          prepare() {
            throw new Error(
              'D1 failure while processing SECRET_ANSWER_VALUE_987654'
            );
          },
          batch() {
            throw new Error('D1 batch failure SECRET_ANSWER_VALUE_987654');
          },
        };
      },
    };
    const logged = [];
    const customLogger = {
      error: (...args) => logged.push(args.join(' ')),
    };
    const res = await handlePracticeApiRequest({
      request: new Request(
        'https://site.example/api/practice/sessions/ps_123/events',
        {
          method: 'POST',
          headers: {
            Origin: 'https://site.example',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_event_id: 'ce_err_1',
            expected_revision: 0,
            type: 'ANSWER_SUBMITTED',
            step_id: 'RAD-001:S01',
            answer: 'SECRET_ANSWER_VALUE_987654',
          }),
        }
      ),
      db: brokenDb,
      user: {
        userId: OWNER_SUB,
        email: 'owner@example.com',
        name: 'Owner',
      },
      pilotOperatorSubject: OWNER_SUB,
      logger: customLogger,
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(body).includes('SECRET_ANSWER_VALUE_987654'));
    assert.ok(!logged.join(' ').includes('SECRET_ANSWER_VALUE_987654'));
  });
});

describe('EXAM-CORE-03 Frontend Regression & Server Sync Behavior', () => {
  it('F-01 Content JSON and radicals-engine.js SHA256 hashes match canonical EXAM-RAD-04 / CORE-02 bytes', () => {
    const jsonBytes = fs.readFileSync(
      path.join(root, 'public', 'data', 'radical-steps-v0.1.json')
    );
    const engineBytes = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js')
    );
    const journalBytes = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js')
    );
    assert.equal(
      crypto.createHash('sha256').update(jsonBytes).digest('hex'),
      'a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2'
    );
    assert.equal(
      crypto.createHash('sha256').update(engineBytes).digest('hex'),
      '59b295a52be0cc9233a012397b4078ac44ca7a27a5247a69691629fe22c7f91f'
    );
    assert.equal(
      crypto.createHash('sha256').update(journalBytes).digest('hex'),
      '41fae3ccdf9b048f451355ea7f8d5c8be6df22840b395a2e3604c0f5673ca2df'
    );
  });

  it('F-02 All 41 original EXAM-RAD-04 DOM IDs and 9 sync/conflict DOM IDs exist in radicals.html and resolve from radicals.js', () => {
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const js = fs.readFileSync(path.join(root, 'public', 'radicals.js'), 'utf8');
    const htmlIds = new Set(
      [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
    );
    const jsIds = [
      ...new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1])),
    ];
    assert.ok(htmlIds.size >= 50, `Expected >= 50 HTML IDs, found ${htmlIds.size}`);
    for (const id of jsIds) {
      assert.ok(htmlIds.has(id), `Missing HTML element for $('${id}')`);
    }
  });

  it('F-03 Client sync: keeps pre-existing local progress separate, gates "Đã lưu máy chủ" on receipt, preserves draft on 409 conflict, and isolates queue per account', async () => {
    const contentData = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );
    const engineCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js'),
      'utf8'
    );
    const journalCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js'),
      'utf8'
    );
    const radicalsCode = fs.readFileSync(
      path.join(root, 'public', 'radicals.js'),
      'utf8'
    );
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

    const elements = {};
    for (const id of allIds) {
      elements[id] = {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        hidden: false,
        open: false,
        disabled: false,
        style: {},
        dataset: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelectorAll() {
          return [];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      };
    }

    const storageMap = new Map();
    // Seed pre-existing local browser progress for RAD-001:S01 before login
    storageMap.set(
      'yd-rad-practice:a16d43b62b2b',
      JSON.stringify({
        version: '0.1.0-DRAFT',
        itemId: 'RAD-001',
        stepId: 'RAD-001:S01',
        answers: { 'RAD-001:S01': '3' },
        drafts: { 'RAD-001:S01': '3' },
        hints: {},
      })
    );

    const db = createMigratedD1();
    try {
      let currentUserSub = 'usr_owner_acct_1';
      let holdNextEventPromise = null;
      let releaseHeldEvent = null;
      const sentEventsByScope = [];

      async function customFetch(urlStr, init = {}) {
        if (urlStr.startsWith('data/radical-steps-v0.1.json')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => contentData,
          };
        }
        const reqUrl = new URL(urlStr, 'https://site.example');
        const headers = new Headers(init.headers || {});
        if ((init.method || 'GET').toUpperCase() === 'POST') {
          headers.set('Origin', 'https://site.example');
        }
        const req = new Request(reqUrl.toString(), {
          method: init.method || 'GET',
          headers,
          body: init.body,
        });
        if (
          reqUrl.pathname.endsWith('/events') &&
          (init.method || 'GET').toUpperCase() === 'POST'
        ) {
          sentEventsByScope.push({
            user: currentUserSub,
            body: JSON.parse(init.body),
          });
          if (holdNextEventPromise) {
            await holdNextEventPromise;
          }
        }
        return handlePracticeApiRequest({
          request: req,
          db,
          user: currentUserSub
            ? {
                userId: currentUserSub,
                email: `${currentUserSub}@example.com`,
                name: currentUserSub,
              }
            : null,
          siteId: DEFAULT_SITE_ID,
          pilotOperatorSubject: 'usr_owner_acct_1,usr_owner_acct_2',
          forbidSyntheticSubjects: true,
        });
      }

      let currentFormValues = { value: '3' };
      class MockFormData {
        get(k) {
          return currentFormValues[k] ?? '';
        }
      }

      const sandbox = {
        window: null,
        globalThis: null,
        document: {
          getElementById: (id) => elements[id] || null,
        },
        localStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => storageMap.set(k, String(v)),
        },
        location: { search: '', reload() {} },
        URLSearchParams,
        FormData: MockFormData,
        crypto,
        fetch: customFetch,
        console,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.window.innerWidth = 1024;
      sandbox.window.addEventListener = () => {};

      vm.createContext(sandbox);
      vm.runInContext(engineCode, sandbox);
      vm.runInContext(journalCode, sandbox);
      vm.runInContext(radicalsCode, sandbox);

      await new Promise((r) => setTimeout(r, 30));
      await sandbox.window.RadicalServerSync.server.ready;

      // 1. Pre-existing local progress was NOT imported into server session!
      assert.equal(sentEventsByScope.length, 0);
      assert.deepEqual(
        JSON.parse(
          JSON.stringify(sandbox.window.RadicalServerSync.getState().answers)
        ),
        {},
        'Server state starts clean without importing unverified local progress'
      );
      assert.ok(
        storageMap.has('yd-rad-practice:a16d43b62b2b'),
        'Local browser progress remains preserved separately in localStorage'
      );
      assert.ok(
        elements['storage-note'].textContent.includes(
          'Tiến trình cục bộ cũ được giữ riêng'
        )
      );

      // 2. Receipt-gated "Đã lưu máy chủ": hold POST /events in flight and check badge
      holdNextEventPromise = new Promise((resolve) => {
        releaseHeldEvent = resolve;
      });
      currentFormValues = { value: '3' };
      elements['answer-form'].onsubmit({ preventDefault() {} });

      assert.ok(
        elements['sync-badge'].textContent.includes('Đang lưu máy chủ'),
        `Expected pending badge while in flight, got: ${elements['sync-badge'].textContent}`
      );
      assert.ok(!elements['sync-badge'].textContent.includes('Đã lưu máy chủ'));

      releaseHeldEvent();
      holdNextEventPromise = null;
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã lưu máy chủ (phiên bản #1)'
      );

      // 3. Conflict handling (409 REVISION_CONFLICT):
      // Advance server revision out-of-band (simulating another tab submitting an event)
      const sessId =
        sandbox.window.RadicalServerSync.server.sessions['RAD-001'].session_id;
      const svc = await createService(db, {
        ...core02Options,
        siteId: DEFAULT_SITE_ID,
      });
      await svc.submit({ subject: 'usr_owner_acct_1' }, sessId, {
        client_event_id: 'ce_other_tab_1',
        expected_revision: 1,
        type: 'HINT_OPENED',
        step_id: 'RAD-001:S02',
      });

      // Select RAD-001:S02 on client (which still thinks revision is 1) and submit an answer
      sandbox.window.RadicalServerSync.getState().stepId = 'RAD-001:S02';
      currentFormValues = { value: '7' };
      elements['answer-form'].oninput();
      elements['answer-form'].onsubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 40));

      assert.equal(elements['conflict-banner'].hidden, false);
      assert.ok(elements['sync-badge'].textContent.includes('Xung đột máy chủ'));
      assert.equal(
        sandbox.window.RadicalServerSync.getState().drafts['RAD-001:S02'],
        '7'
      );
      assert.equal(
        sandbox.window.RadicalServerSync.server.sessions['RAD-001'].revision,
        2
      );

      // User clicks #conflict-resubmit -> resubmits preserved draft at revision #2 and succeeds (#3)
      await sandbox.window.RadicalServerSync.resolveConflictResubmit();
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(elements['conflict-banner'].hidden, true);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã lưu máy chủ (phiên bản #3)'
      );

      // 4. Cross-account queue isolation:
      const scope1 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_1`)
      ).slice(0, 24);
      const scope2 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_2`)
      ).slice(0, 24);
      storageMap.set(
        `yd-rad-srv-queue:a16d43b62b2b:${scope1}`,
        JSON.stringify([
          {
            client_event_id: 'ce_queued_from_acct_1',
            account_scope: scope1,
            item_id: 'RAD-001',
            session_id: sessId,
            expected_revision: 3,
            type: 'HINT_OPENED',
            step_id: 'RAD-001:S03',
          },
        ])
      );

      currentUserSub = 'usr_owner_acct_2';
      const countBeforeSwitch = sentEventsByScope.length;
      await sandbox.window.RadicalServerSync.initServerSync();
      await new Promise((r) => setTimeout(r, 40));

      assert.equal(sandbox.window.RadicalServerSync.server.accountScope, scope2);
      assert.equal(sentEventsByScope.length, countBeforeSwitch);
      assert.equal(sandbox.window.RadicalServerSync.server.queue.length, 0);
    } finally {
      db.close();
    }
  });

  it('F-04 EXAM-RAD-04 frontend regression: DAG validation, 15-step evaluation, and 300-event local journal invariants', () => {
    const E = require('../vendor/radicals-engine.cjs');
    require('../public/radicals-journal.js');
    const J = globalThis.RadicalJournal;
    const data = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );

    // 1. Validate canonical step graphs (4 items, 15 steps)
    assert.doesNotThrow(() => E.validate(data));
    assert.equal(data.graphs.length, 4);
    assert.equal(data.steps.length, 15);

    // 2. Reject cyclic or broken graphs
    const cyclic = JSON.parse(JSON.stringify(data));
    cyclic.graphs[0].edges.push({ from: 'RAD-001:S04', to: 'RAD-001:S01' });
    assert.throws(() => E.validate(cyclic));

    // 3. Evaluate all 15 steps with expected answers
    const answers = {};
    for (const g of data.graphs) {
      for (const sid of g.step_ids) {
        const step = data.steps.find((s) => s.step_id === sid);
        const completed = [...E.replay(data, answers)];
        const res = E.evaluate(data, sid, step.interaction.expected, completed);
        assert.equal(res.status, 'CORRECT', `Step ${sid} expected CORRECT`);
        answers[sid] = step.interaction.expected;
      }
    }
    assert.equal(E.replay(data, answers).size, 15);

    // 4. Local journal 300-event ring buffer, truncation coverage, and ITEM_RESET
    const j = J.create(data, 'sess_local_reg_1', false);
    assert.equal(j.coverage['RAD-001'], true);
    J.append(data, j, 'ANSWER_SUBMITTED', 'RAD-001', 'RAD-001:S01', {
      answer: '3',
      result_status: 'CORRECT',
      hint_level: 0,
    });
    assert.equal(
      J.evidence(j, 'RAD-001', 'RAD-001:S01').status,
      'CORRECT_WITHOUT_RECORDED_SUPPORT'
    );
    // Opening explanation AFTER correct answer does not retroactively taint prior answer
    J.append(data, j, 'EXPLANATION_OPENED', 'RAD-001', 'RAD-001:S01', {
      hint_level: 0,
    });
    assert.equal(
      J.evidence(j, 'RAD-001', 'RAD-001:S01').status,
      'CORRECT_WITHOUT_RECORDED_SUPPORT'
    );
    // Overflow 300 events -> truncated = true, evicted item coverage becomes false until ITEM_RESET
    for (let i = 0; i < 305; i++) {
      J.append(data, j, 'HINT_OPENED', 'RAD-002', 'RAD-002:S01', {
        hint_level: 1,
      });
    }
    assert.equal(j.events.length, J.LIMIT);
    assert.equal(j.truncated, true);
    assert.equal(j.coverage['RAD-001'], false);
    J.append(data, j, 'ITEM_RESET', 'RAD-001', null);
    assert.equal(j.coverage['RAD-001'], true);
  });

  it('F-05 FIX-01 (C03-R01): mid-flight account switch at session create/resume and in-flight POST /events aborts stale flow, preserves queue A, and prevents cross-account write or UI leak', async () => {
    const contentData = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );
    const engineCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js'),
      'utf8'
    );
    const journalCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js'),
      'utf8'
    );
    const radicalsCode = fs.readFileSync(
      path.join(root, 'public', 'radicals.js'),
      'utf8'
    );
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

    const elements = {};
    for (const id of allIds) {
      elements[id] = {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        hidden: false,
        open: false,
        disabled: false,
        style: {},
        dataset: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelectorAll() {
          return [];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      };
    }

    const storageMap = new Map();
    const db = createMigratedD1();
    try {
      let currentUserSub = 'usr_owner_acct_1';
      let holdNextEventPromise = null;
      let releaseHeldEvent = null;
      const scope1 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_1`)
      ).slice(0, 24);
      const scope2 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_2`)
      ).slice(0, 24);

      async function customFetch(urlStr, init = {}) {
        if (urlStr.startsWith('data/radical-steps-v0.1.json')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => contentData,
          };
        }
        const reqUrl = new URL(urlStr, 'https://site.example');
        const headers = new Headers(init.headers || {});
        if ((init.method || 'GET').toUpperCase() === 'POST') {
          headers.set('Origin', 'https://site.example');
        }
        const req = new Request(reqUrl.toString(), {
          method: init.method || 'GET',
          headers,
          body: init.body,
        });
        const capturedSub = currentUserSub;
        if (
          reqUrl.pathname.endsWith('/events') &&
          (init.method || 'GET').toUpperCase() === 'POST' &&
          holdNextEventPromise
        ) {
          await holdNextEventPromise;
        }
        return handlePracticeApiRequest({
          request: req,
          db,
          user: capturedSub
            ? {
                userId: capturedSub,
                email: `${capturedSub}@example.com`,
                name: capturedSub,
              }
            : null,
          siteId: DEFAULT_SITE_ID,
          pilotOperatorSubject: 'usr_owner_acct_1,usr_owner_acct_2',
          forbidSyntheticSubjects: true,
        });
      }

      let currentFormValues = { value: '3' };
      class MockFormData {
        get(k) {
          return currentFormValues[k] ?? '';
        }
      }

      const sandbox = {
        window: null,
        globalThis: null,
        document: { getElementById: (id) => elements[id] || null },
        localStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => storageMap.set(k, String(v)),
        },
        location: { search: '', reload() {} },
        URLSearchParams,
        FormData: MockFormData,
        crypto,
        fetch: customFetch,
        console,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.window.innerWidth = 1024;
      sandbox.window.addEventListener = () => {};

      vm.createContext(sandbox);
      vm.runInContext(engineCode, sandbox);
      vm.runInContext(journalCode, sandbox);
      vm.runInContext(radicalsCode, sandbox);

      await new Promise((r) => setTimeout(r, 30));
      await sandbox.window.RadicalServerSync.server.ready;
      const sync = sandbox.window.RadicalServerSync;

      // 1. Account A submits an answer while POST /events is held in flight;
      //    meanwhile client switches to Account B before POST /events resolves.
      holdNextEventPromise = new Promise((resolve) => {
        releaseHeldEvent = resolve;
      });
      currentFormValues = { value: '3' };
      elements['answer-form'].onsubmit({ preventDefault() {} });
      assert.equal(sync.getState().answers['RAD-001:S01'], '3');

      currentUserSub = 'usr_owner_acct_2';
      await sync.initServerSync();
      // Account B view must be clean immediately after switching
      assert.equal(sync.server.accountScope, scope2);
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().answers)), {});
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().drafts)), {});
      assert.ok(
        !elements['answer-fields'].innerHTML.includes('value="3"'),
        'Account A answer must not be rendered in Account B form fields'
      );

      // Now release Account A's held in-flight POST /events response
      releaseHeldEvent();
      holdNextEventPromise = null;
      await new Promise((r) => setTimeout(r, 40));

      // Stale response from Account A must not contaminate Account B state or UI
      assert.equal(sync.server.accountScope, scope2);
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().answers)), {});
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="3"'));

      // 2. Reviewer C03-R01 race: Account A has a queued event with session_id: null;
      //    cookie switches to Account B right before flushServerQueue creates session.
      currentUserSub = 'usr_owner_acct_1';
      await sync.initServerSync();
      assert.equal(sync.server.accountScope, scope1);
      assert.equal(sync.getState().answers['RAD-001:S01'], '3');

      sync.server.queue.push({
        client_event_id: 'review_old_A',
        account_scope: scope1,
        item_id: 'RAD-002',
        session_id: null,
        expected_revision: 0,
        type: 'ANSWER_SUBMITTED',
        step_id: 'RAD-002:S01',
        answer: contentData.steps.find((x) => x.step_id === 'RAD-002:S01')
          .interaction.expected,
      });
      currentUserSub = 'usr_owner_acct_2';
      await sync.flushServerQueue();

      const rows = db.sqlite
        .prepare(
          "SELECT e.client_event_id,p.site_subject_id FROM practice_events e JOIN learner_profiles l ON l.learner_id=e.learner_id JOIN principals p ON p.principal_id=l.principal_id WHERE e.client_event_id='review_old_A'"
        )
        .all();
      assert.equal(
        rows.length,
        0,
        'Account A queued event must never be written under Account B'
      );

      // Account A's queue must still be preserved intact in Account A's storage key
      const savedQueueA = JSON.parse(
        storageMap.get(`yd-rad-srv-queue:a16d43b62b2b:${scope1}`) || '[]'
      );
      assert.equal(savedQueueA.length, 1);
      assert.equal(savedQueueA[0].client_event_id, 'review_old_A');
      assert.equal(savedQueueA[0].account_scope, scope1);
      assert.equal(savedQueueA[0].session_id, null);

      // And UI must now reflect Account B (empty), not Account A's '3'
      assert.equal(sync.server.accountScope, scope2);
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().answers)), {});
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="3"'));
    } finally {
      db.close();
    }
  });

  it('F-06 FIX-01 (C03-R02): 401 logout, 403 forbidden, and network failure never copy authenticated state/journal to anonymous storage or leak across views', async () => {
    const contentData = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );
    const engineCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js'),
      'utf8'
    );
    const journalCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js'),
      'utf8'
    );
    const radicalsCode = fs.readFileSync(
      path.join(root, 'public', 'radicals.js'),
      'utf8'
    );
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

    const elements = {};
    for (const id of allIds) {
      elements[id] = {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        hidden: false,
        open: false,
        disabled: false,
        style: {},
        dataset: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelectorAll() {
          return [];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      };
    }

    const anonKey = 'yd-rad-practice:a16d43b62b2b';
    const storageMap = new Map();
    storageMap.set(
      anonKey,
      JSON.stringify({
        version: '0.1.0-DRAFT',
        itemId: 'RAD-001',
        stepId: 'RAD-001:S01',
        answers: { 'RAD-001:S01': '3' },
        drafts: { 'RAD-001:S01': '3' },
        hints: {},
      })
    );

    const db = createMigratedD1();
    try {
      let currentUserSub = 'usr_owner_acct_2';
      let simulateNetworkFailure = false;

      async function customFetch(urlStr, init = {}) {
        if (urlStr.startsWith('data/radical-steps-v0.1.json')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => contentData,
          };
        }
        if (simulateNetworkFailure) {
          throw new Error('Simulated network failure');
        }
        const reqUrl = new URL(urlStr, 'https://site.example');
        const headers = new Headers(init.headers || {});
        if ((init.method || 'GET').toUpperCase() === 'POST') {
          headers.set('Origin', 'https://site.example');
        }
        const req = new Request(reqUrl.toString(), {
          method: init.method || 'GET',
          headers,
          body: init.body,
        });
        return handlePracticeApiRequest({
          request: req,
          db,
          user: currentUserSub
            ? {
                userId: currentUserSub,
                email: `${currentUserSub}@example.com`,
                name: currentUserSub,
              }
            : null,
          siteId: DEFAULT_SITE_ID,
          pilotOperatorSubject: 'usr_owner_acct_1,usr_owner_acct_2',
          forbidSyntheticSubjects: true,
        });
      }

      let currentFormValues = { value: '3' };
      class MockFormData {
        get(k) {
          return currentFormValues[k] ?? '';
        }
      }

      const sandbox = {
        window: null,
        globalThis: null,
        document: { getElementById: (id) => elements[id] || null },
        localStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => storageMap.set(k, String(v)),
        },
        location: { search: '', reload() {} },
        URLSearchParams,
        FormData: MockFormData,
        crypto,
        fetch: customFetch,
        console,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.window.innerWidth = 1024;
      sandbox.window.addEventListener = () => {};

      vm.createContext(sandbox);
      vm.runInContext(engineCode, sandbox);
      vm.runInContext(journalCode, sandbox);
      vm.runInContext(radicalsCode, sandbox);

      await new Promise((r) => setTimeout(r, 30));
      await sandbox.window.RadicalServerSync.server.ready;
      const sync = sandbox.window.RadicalServerSync;

      const before = storageMap.get(anonKey);
      assert.equal( JSON.parse(before).answers['RAD-001:S01'], '3' );

      // Authenticated Account B submits '9'
      currentFormValues = { value: '9' };
      elements['answer-form'].onsubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.getState().answers['RAD-001:S01'], '9');
      assert.ok(elements['answer-fields'].innerHTML.includes('value="9"'));

      // Case 1: 401 Logout / Expired login
      currentUserSub = null;
      await sync.initServerSync();
      elements['answer-form'].oninput();
      assert.equal(sync.server.mode, 'anonymous');
      assert.equal(
        storageMap.get(anonKey),
        before,
        '401 logout must not copy authenticated answers/journal into anonymous localStorage'
      );
      assert.equal(sync.getState().answers['RAD-001:S01'], '3');
      assert.ok(elements['answer-fields'].innerHTML.includes('value="3"'));
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="9"'));

      // Case 2: 403 Forbidden transition after being authenticated
      currentUserSub = 'usr_owner_acct_2';
      await sync.initServerSync();
      assert.equal(sync.getState().answers['RAD-001:S01'], '9');

      currentUserSub = 'usr_non_operator_3';
      await sync.initServerSync();
      elements['answer-form'].oninput();
      assert.equal(sync.server.mode, 'forbidden');
      assert.equal(
        storageMap.get(anonKey),
        before,
        '403 transition must not copy authenticated answers/journal into anonymous localStorage'
      );
      assert.equal(sync.getState().answers['RAD-001:S01'], '3');
      assert.ok(elements['answer-fields'].innerHTML.includes('value="3"'));
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="9"'));

      // Case 3: Network failure while authenticated
      currentUserSub = 'usr_owner_acct_2';
      await sync.initServerSync();
      assert.equal(sync.getState().answers['RAD-001:S01'], '9');

      simulateNetworkFailure = true;
      await sync.initServerSync();
      elements['answer-form'].oninput();
      assert.equal(sync.server.mode, 'local');
      assert.equal(
        storageMap.get(anonKey),
        before,
        'Network failure transition must not copy authenticated answers/journal into anonymous localStorage'
      );
      assert.equal(sync.getState().answers['RAD-001:S01'], '3');
      assert.ok(elements['answer-fields'].innerHTML.includes('value="3"'));
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="9"'));
    } finally {
      db.close();
    }
  });

  it('F-07 FIX-01: 409 conflict refresh returning a different account scope and overlapping initServerSync() calls prevent cross-account state/UI contamination', async () => {
    const contentData = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );
    const engineCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js'),
      'utf8'
    );
    const journalCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js'),
      'utf8'
    );
    const radicalsCode = fs.readFileSync(
      path.join(root, 'public', 'radicals.js'),
      'utf8'
    );
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

    const elements = {};
    for (const id of allIds) {
      elements[id] = {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        hidden: false,
        open: false,
        disabled: false,
        style: {},
        dataset: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelectorAll() {
          return [];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      };
    }

    const storageMap = new Map();
    const db = createMigratedD1();
    try {
      let currentUserSub = 'usr_owner_acct_1';
      let switchToUserOnConflictGet = null;
      let holdProgressForUser = null;
      let releaseHeldProgress = null;
      const scope1 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_1`)
      ).slice(0, 24);
      const scope2 = (
        await sha256Hex(`${DEFAULT_SITE_ID}:usr_owner_acct_2`)
      ).slice(0, 24);

      async function customFetch(urlStr, init = {}) {
        if (urlStr.startsWith('data/radical-steps-v0.1.json')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => contentData,
          };
        }
        const reqUrl = new URL(urlStr, 'https://site.example');
        const method = (init.method || 'GET').toUpperCase();
        if (
          switchToUserOnConflictGet &&
          method === 'GET' &&
          reqUrl.pathname.startsWith('/api/practice/sessions/')
        ) {
          currentUserSub = switchToUserOnConflictGet;
          switchToUserOnConflictGet = null;
        }
        const capturedSub = currentUserSub;
        if (
          reqUrl.pathname === '/api/me/progress' &&
          holdProgressForUser &&
          capturedSub === holdProgressForUser
        ) {
          await new Promise((resolve) => {
            releaseHeldProgress = resolve;
          });
        }
        const headers = new Headers(init.headers || {});
        if (method === 'POST') {
          headers.set('Origin', 'https://site.example');
        }
        const req = new Request(reqUrl.toString(), {
          method,
          headers,
          body: init.body,
        });
        return handlePracticeApiRequest({
          request: req,
          db,
          user: capturedSub
            ? {
                userId: capturedSub,
                email: `${capturedSub}@example.com`,
                name: capturedSub,
              }
            : null,
          siteId: DEFAULT_SITE_ID,
          pilotOperatorSubject: 'usr_owner_acct_1,usr_owner_acct_2',
          forbidSyntheticSubjects: true,
        });
      }

      let currentFormValues = { value: '3' };
      class MockFormData {
        get(k) {
          return currentFormValues[k] ?? '';
        }
      }

      const sandbox = {
        window: null,
        globalThis: null,
        document: { getElementById: (id) => elements[id] || null },
        localStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => storageMap.set(k, String(v)),
        },
        location: { search: '', reload() {} },
        URLSearchParams,
        FormData: MockFormData,
        crypto,
        fetch: customFetch,
        console,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.window.innerWidth = 1024;
      sandbox.window.addEventListener = () => {};

      vm.createContext(sandbox);
      vm.runInContext(engineCode, sandbox);
      vm.runInContext(journalCode, sandbox);
      vm.runInContext(radicalsCode, sandbox);

      await new Promise((r) => setTimeout(r, 30));
      await sandbox.window.RadicalServerSync.server.ready;
      const sync = sandbox.window.RadicalServerSync;

      // Submit RAD-001:S01 = '3' under Account A (revision #1)
      currentFormValues = { value: '3' };
      elements['answer-form'].onsubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.server.lastSavedRevision, 1);

      // Advance Account A's session on server out-of-band to revision #2
      const sessIdA = sync.server.sessions['RAD-001'].session_id;
      const svc = await createService(db, {
        ...core02Options,
        siteId: DEFAULT_SITE_ID,
      });
      await svc.submit({ subject: 'usr_owner_acct_1' }, sessIdA, {
        client_event_id: 'ce_conflict_trigger_A',
        expected_revision: 1,
        type: 'HINT_OPENED',
        step_id: 'RAD-001:S02',
      });

      // 1. Trigger 409 on RAD-001:S02 under Account A, but switch cookie to Account B
      //    when the 409 handler performs GET /api/practice/sessions/:id
      switchToUserOnConflictGet = 'usr_owner_acct_2';
      sync.getState().stepId = 'RAD-001:S02';
      currentFormValues = { value: '7' };
      elements['answer-form'].oninput();
      elements['answer-form'].onsubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 40));

      // Must switch to Account B cleanly without setting Account A's conflict banner or draft '7' on Account B
      assert.equal(sync.server.accountScope, scope2);
      assert.equal(sync.server.conflict, null);
      assert.equal(elements['conflict-banner'].hidden, true);
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().answers)), {});
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().drafts)), {});
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="7"'));
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="3"'));

      // 2. Overlapping initServerSync() calls:
      //    Start slow initServerSync() for Account A (held), then start and finish initServerSync() for Account B,
      //    then release Account A's slow initServerSync() response.
      holdProgressForUser = 'usr_owner_acct_1';
      currentUserSub = 'usr_owner_acct_1';
      const slowInitA = sync.initServerSync();
      await new Promise((r) => setTimeout(r, 15));

      currentUserSub = 'usr_owner_acct_2';
      const fastInitB = sync.initServerSync();
      await fastInitB;
      assert.equal(sync.server.accountScope, scope2);

      // Release Account A's stale initServerSync()
      holdProgressForUser = null;
      if (releaseHeldProgress) releaseHeldProgress();
      await slowInitA;
      await new Promise((r) => setTimeout(r, 30));

      // Account B must remain active and uncontaminated by Account A's late response
      assert.equal(sync.server.accountScope, scope2);
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().answers)), {});
      assert.deepEqual(JSON.parse(JSON.stringify(sync.getState().drafts)), {});
      assert.ok(!elements['answer-fields'].innerHTML.includes('value="3"'));
    } finally {
      db.close();
    }
  });

  it('F-08 Per-item sync badge: distinguishes "Đã tải từ máy chủ" vs "Đã lưu máy chủ", shows revision of selected item on 01 <-> 04 switch, and ignores late receipts from another item', async () => {
    const contentData = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public', 'data', 'radical-steps-v0.1.json'),
        'utf8'
      )
    );
    const engineCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-engine.js'),
      'utf8'
    );
    const journalCode = fs.readFileSync(
      path.join(root, 'public', 'radicals-journal.js'),
      'utf8'
    );
    const radicalsCode = fs.readFileSync(
      path.join(root, 'public', 'radicals.js'),
      'utf8'
    );
    const html = fs.readFileSync(
      path.join(root, 'public', 'radicals.html'),
      'utf8'
    );
    const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

    const elements = {};
    for (const id of allIds) {
      elements[id] = {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        hidden: false,
        open: false,
        disabled: false,
        style: {},
        dataset: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        querySelectorAll() {
          return [];
        },
        focus() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      };
    }

    const storageMap = new Map();
    const db = createMigratedD1();
    try {
      let currentUserSub = 'usr_owner_acct_1';
      let holdNextEventPromise = null;
      let releaseHeldEvent = null;

      async function customFetch(urlStr, init = {}) {
        if (urlStr.startsWith('data/radical-steps-v0.1.json')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => contentData,
          };
        }
        const reqUrl = new URL(urlStr, 'https://site.example');
        const method = (init.method || 'GET').toUpperCase();
        const headers = new Headers(init.headers || {});
        if (method === 'POST') {
          headers.set('Origin', 'https://site.example');
        }
        const req = new Request(reqUrl.toString(), {
          method,
          headers,
          body: init.body,
        });
        if (
          reqUrl.pathname.endsWith('/events') &&
          method === 'POST' &&
          holdNextEventPromise
        ) {
          const waitP = holdNextEventPromise;
          holdNextEventPromise = null;
          await waitP;
        }
        return handlePracticeApiRequest({
          request: req,
          db,
          user: currentUserSub
            ? {
                userId: currentUserSub,
                email: `${currentUserSub}@example.com`,
                name: currentUserSub,
              }
            : null,
          siteId: DEFAULT_SITE_ID,
          pilotOperatorSubject: 'usr_owner_acct_1,usr_owner_acct_2',
          forbidSyntheticSubjects: true,
        });
      }

      let currentFormValues = { value: '3' };
      class MockFormData {
        get(k) {
          return currentFormValues[k] ?? '';
        }
      }

      const sandbox = {
        window: null,
        globalThis: null,
        document: { getElementById: (id) => elements[id] || null },
        localStorage: {
          getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
          setItem: (k, v) => storageMap.set(k, String(v)),
        },
        location: { search: '', reload() {} },
        URLSearchParams,
        FormData: MockFormData,
        crypto,
        fetch: customFetch,
        console,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.window.innerWidth = 1024;
      sandbox.window.addEventListener = () => {};

      vm.createContext(sandbox);
      vm.runInContext(engineCode, sandbox);
      vm.runInContext(journalCode, sandbox);
      vm.runInContext(radicalsCode, sandbox);

      await new Promise((r) => setTimeout(r, 30));
      await sandbox.window.RadicalServerSync.server.ready;
      const sync = sandbox.window.RadicalServerSync;

      // 1. Initially hydrated RAD-001 session has no client save receipt yet -> "Đã tải từ máy chủ (phiên bản #0)"
      assert.equal(sync.getState().itemId, 'RAD-001');
      assert.equal(sync.server.lastSavedRevision, null);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã tải từ máy chủ (phiên bản #0)'
      );

      // 2. Submit RAD-001:S01 -> receipt #1 -> "Đã lưu máy chủ (phiên bản #1)"
      currentFormValues = { value: '3' };
      elements['answer-form'].onsubmit({ preventDefault() {} });
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.server.lastSavedRevision, 1);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã lưu máy chủ (phiên bản #1)'
      );

      // 3. Switch RAD-001 -> RAD-004: must show RAD-004's loaded revision (#0), NOT RAD-001's #1
      sync.selectItem('RAD-004');
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.getState().itemId, 'RAD-004');
      assert.equal(sync.server.lastSavedRevision, null);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã tải từ máy chủ (phiên bản #0)'
      );

      // 4. Switch back RAD-004 -> RAD-001: shows RAD-001's saved revision (#1)
      sync.selectItem('RAD-001');
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.getState().itemId, 'RAD-001');
      assert.equal(sync.server.lastSavedRevision, 1);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã lưu máy chủ (phiên bản #1)'
      );

      // 5. Submit RAD-001:S02 while holding POST /events in flight, then switch to RAD-004 before receipt arrives
      holdNextEventPromise = new Promise((resolve) => {
        releaseHeldEvent = resolve;
      });
      sync.getState().stepId = 'RAD-001:S02';
      currentFormValues = { value: '7' };
      elements['answer-form'].onsubmit({ preventDefault() {} });
      assert.ok(
        elements['sync-badge'].textContent.includes('Đang lưu máy chủ'),
        `Expected pending badge on RAD-001, got: ${elements['sync-badge'].textContent}`
      );

      // Switch to RAD-004 while RAD-001's event is still in flight
      sync.selectItem('RAD-004');
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(sync.getState().itemId, 'RAD-004');
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã tải từ máy chủ (phiên bản #0)'
      );

      // Now release RAD-001's held receipt (#2) while user is still viewing RAD-004
      releaseHeldEvent();
      await new Promise((r) => setTimeout(r, 40));

      // RAD-001 session updated to #2 in background, but active badge on RAD-004 must stay at RAD-004 (#0 loaded)
      assert.equal(sync.server.sessions['RAD-001'].revision, 2);
      assert.equal(sync.getState().itemId, 'RAD-004');
      assert.equal(sync.server.lastSavedRevision, null);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã tải từ máy chủ (phiên bản #0)'
      );

      // Switch back to RAD-001: now displays RAD-001's receipt-confirmed revision #2
      sync.selectItem('RAD-001');
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(sync.getState().itemId, 'RAD-001');
      assert.equal(sync.server.lastSavedRevision, 2);
      assert.equal(
        elements['sync-badge'].textContent,
        'Đã lưu máy chủ (phiên bản #2)'
      );
    } finally {
      db.close();
    }
  });
});



