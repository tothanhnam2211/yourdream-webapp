'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

function loadUmd(relPath, globalName) {
  const code = fs.readFileSync(path.join(PUBLIC_DIR, relPath), 'utf8');
  const mod = { exports: {} };
  const ctx = { module: mod, exports: mod.exports, structuredClone };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(code, ctx);
  return mod.exports && Object.keys(mod.exports).length ? mod.exports : ctx[globalName];
}

const RadicalEngine = loadUmd('radicals-engine.js', 'RadicalEngine');
const RadicalProfiles = loadUmd('radicals-profiles.js', 'RadicalProfiles');
const RadicalPreviewJournal = loadUmd('radicals-preview-journal.js', 'RadicalPreviewJournal');
const YourdreamMath = loadUmd('safe-math.js', 'YourdreamMath');
const katex = loadUmd('vendor/katex/katex.min.js', 'katex');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, relPath), 'utf8'));
}

function sha256File(relPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(PUBLIC_DIR, relPath))).digest('hex');
}

test('MIDTERM1-PHASE-A · Profile Loader, DAG Layout, Multi-Terminal Completion & Choice Feedback', async (t) => {
  const catalog = readJson('data/practice-preview-profiles.json');
  assert.equal(catalog.status, 'DRAFT_LOCAL_PREVIEW_ONLY');
  assert.equal(catalog.profiles.length, 5);

  await t.test('M1-01 All 5 declared profiles match exact SHA256 and load cleanly', () => {
    for (const p of catalog.profiles) {
      assert.equal(sha256File(p.path), p.sha256, `SHA256 mismatch for ${p.id}`);
      const raw = readJson(p.path);
      const loaded = RadicalProfiles.load(raw, p.profile, RadicalEngine);
      assert.ok(loaded.graphs.length >= 4);
      assert.ok(loaded.steps.length >= 15);
    }
  });

  await t.test('M1-02 Midterm 1 fixture loads 5 exercises and 26 steps with finite DAG coordinates and subquestion groups', () => {
    const raw = readJson('data/midterm1-fixture-preview.json');
    const data = RadicalProfiles.load(raw, 'lesson-contract-v01', RadicalEngine);
    assert.equal(data.graphs.length, 5);
    assert.equal(data.steps.length, 26);
    assert.deepEqual(
      Array.from(data.graphs, (g) => g.step_ids.length),
      [4, 5, 5, 3, 9]
    );
    const by = Object.fromEntries(data.steps.map((s) => [s.step_id, s]));
    for (const g of data.graphs) {
      const view = RadicalProfiles.layout(g, by);
      assert.ok(Number.isFinite(view.width) && view.width >= 360);
      assert.ok(Number.isFinite(view.height) && view.height >= 180);
      for (const sid of g.step_ids) {
        const pt = view.points[sid];
        assert.ok(Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]), `Missing point for ${sid}`);
      }
    }
    // Exercise 5 (P04) preserves 4 subquestion groups and 2 terminals (S02, S09)
    const g5 = data.graphs[4];
    assert.equal(g5.item_id, 'EXAM-GRAPH-02:P04');
    assert.deepEqual(Array.from(g5.terminal_step_ids), ['EXAM-GRAPH-02:P04:S02', 'EXAM-GRAPH-02:P04:S09']);
    assert.deepEqual(Array.from(Object.keys(g5.subquestion_step_groups)).sort(), ['1', '2', '3', 'shared_domain']);
  });

  await t.test('M1-03 Multi-terminal completion policy (ALL_STEPS_CORRECT) requires S02 even if S09 is finished', () => {
    const raw = readJson('data/midterm1-fixture-preview.json');
    const data = RadicalProfiles.load(raw, 'lesson-contract-v01', RadicalEngine);
    const p04 = data.graphs.find((g) => g.item_id === 'EXAM-GRAPH-02:P04');
    const withoutS02 = new Set(p04.step_ids.filter((id) => id !== 'EXAM-GRAPH-02:P04:S02'));
    assert.equal(RadicalProfiles.complete(p04, withoutS02), false, 'Must not be complete when independent terminal S02 is missing');
    const allP04 = new Set(p04.step_ids);
    assert.equal(RadicalProfiles.complete(p04, allP04), true);
  });

  await t.test('M1-04 Choice evaluation returns per-choice feedback and diagnosis_code; unknown choice returns NEEDS_REVIEW', () => {
    const raw = readJson('data/midterm1-fixture-preview.json');
    const data = RadicalProfiles.load(raw, 'lesson-contract-v01', RadicalEngine);
    const stepId = 'EXAM-GRAPH-02:P02:S01';

    const okRes = RadicalProfiles.evaluate(RadicalEngine, data, stepId, 'x_ne_1', []);
    assert.equal(okRes.status, 'CORRECT');
    assert.equal(okRes.diagnosis_code, 'TARGET_POLYNOMIAL_DENOMINATOR_NONZERO');
    assert.match(okRes.feedback, /x\s*\\ne(?:q)?\s*1/);

    const wrongRes = RadicalProfiles.evaluate(RadicalEngine, data, stepId, 'x_ge_1', []);
    assert.equal(wrongRes.status, 'TRY_AGAIN');
    assert.equal(wrongRes.diagnosis_code, 'CONFUSE_POLYNOMIAL_DENOMINATOR_WITH_RADICAND');

    const unknownRes = RadicalProfiles.evaluate(RadicalEngine, data, stepId, 'not_a_valid_choice', []);
    assert.equal(unknownRes.status, 'NEEDS_REVIEW');

    const protoRes = RadicalProfiles.evaluate(RadicalEngine, data, stepId, '__proto__', []);
    assert.equal(protoRes.status, 'NEEDS_REVIEW');
  });

  await t.test('M1-05 Rejects tampered contract metadata, cycles, dangling refs, and prototype keys', () => {
    const raw = readJson('data/midterm1-fixture-preview.json');
    assert.throws(() => {
      const bad = structuredClone(raw);
      bad.supports_secure_assessment = true;
      RadicalProfiles.load(bad, 'lesson-contract-v01', RadicalEngine);
    }, /PROFILE_INVALID:CONTRACT_OR_AUDIENCE/);

    assert.throws(() => {
      const bad = structuredClone(raw);
      bad.step_graphs[0].steps[0].step_id = '__proto__';
      RadicalProfiles.load(bad, 'lesson-contract-v01', RadicalEngine);
    }, /PROFILE_INVALID/);
  });
});

test('MIDTERM1-PHASE-A · Skill Diagnosis & Retry Journal Flow (Existing Events Only)', async (t) => {
  const raw = readJson('data/midterm1-fixture-preview.json');
  const data = RadicalProfiles.load(raw, 'lesson-contract-v01', RadicalEngine);
  data.content_sha256 = sha256File('data/midterm1-fixture-preview.json');

  await t.test('M1-06 Tracks ANSWER_SUBMITTED, HINT_OPENED, EXPLANATION_OPENED, ITEM_RESET and computes skill diagnosis', () => {
    const j = RadicalPreviewJournal.create(data, 'sess-midterm1-test');
    const completed = new Set();

    // 1. Clean correct on P01:S01..S04 -> cube_root skills become SOLID_IN_SESSION
    for (const [sid, exp] of [
      ['EXAM-GRAPH-02:P01:S01', '-4'],
      ['EXAM-GRAPH-02:P01:S02', '-5'],
      ['EXAM-GRAPH-02:P01:S03', '12'],
      ['EXAM-GRAPH-02:P01:S04', '3'],
    ]) {
      RadicalPreviewJournal.append(data, j, 'ANSWER_SUBMITTED', 'EXAM-GRAPH-02:P01', sid, {
        answer: exp,
        result_status: 'CORRECT',
        hint_level: 0,
      });
      completed.add(sid);
    }

    // 2. Wrong attempt on P02:S01 -> DRAFT:radical.skill.domain flagged as NEEDS_RETRY with diagnosis_code
    RadicalPreviewJournal.append(data, j, 'ANSWER_SUBMITTED', 'EXAM-GRAPH-02:P02', 'EXAM-GRAPH-02:P02:S01', {
      answer: 'x_ge_1',
      result_status: 'TRY_AGAIN',
      diagnosis_code: 'CONFUSE_POLYNOMIAL_DENOMINATOR_WITH_RADICAND',
      hint_level: 0,
    });

    // 3. Hint opened + correct on P03-B:S06 -> target_value_equation flagged as NEEDS_REINFORCEMENT
    RadicalPreviewJournal.append(data, j, 'HINT_OPENED', 'EXAM-GRAPH-02:P03-B', 'EXAM-GRAPH-02:P03:S06', {
      hint_level: 1,
    });
    RadicalPreviewJournal.append(data, j, 'ANSWER_SUBMITTED', 'EXAM-GRAPH-02:P03-B', 'EXAM-GRAPH-02:P03:S06', {
      answer: '4',
      result_status: 'CORRECT',
      hint_level: 1,
    });
    completed.add('EXAM-GRAPH-02:P03:S06');

    const diag = RadicalPreviewJournal.diagnoseSkills(data, j, completed);
    assert.equal(diag.policy_version, 'PENDING');
    const cubeSkill = diag.skills.find((s) => s.skill_id === 'EXAM-GRAPH-02:skill.cube_root_numeric');
    assert.equal(cubeSkill.status, 'SOLID_IN_SESSION');
    assert.equal(cubeSkill.batch01_state, 'CRITERIA_MET_IN_SESSION');
    assert.equal(cubeSkill.clean_steps, 3);

    const domainSkill = diag.skills.find((s) => s.skill_id === 'DRAFT:radical.skill.domain');
    assert.equal(domainSkill.status, 'NEEDS_RETRY');
    assert.equal(domainSkill.batch01_state, 'IN_PRACTICE_NEEDS_RETRY');
    assert.ok(domainSkill.diagnosis_codes.includes('CONFUSE_POLYNOMIAL_DENOMINATOR_WITH_RADICAND'));
    assert.equal(domainSkill.recommended_target.step_id, 'EXAM-GRAPH-02:P02:S01');

    const eqSkill = diag.skills.find((s) => s.skill_id === 'EXAM-GRAPH-02:skill.target_value_equation');
    assert.equal(eqSkill.status, 'NEEDS_REINFORCEMENT');
    assert.equal(eqSkill.batch01_state, 'IN_PRACTICE_WITH_SUPPORT');
    assert.equal(eqSkill.recommended_target.step_id, 'EXAM-GRAPH-02:P03:S06');

    const unstartedSkill = diag.skills.find((s) => s.skill_id === 'EXAM-GRAPH-02:skill.evaluate_at_point');
    assert.equal(unstartedSkill.status, 'UNATTEMPTED');
    assert.equal(unstartedSkill.batch01_state, 'NOT_STARTED');

    // 4. Reset P03-B cycle and solve S06..S08 cleanly -> target_value_equation becomes SOLID_IN_SESSION
    RadicalPreviewJournal.append(data, j, 'ITEM_RESET', 'EXAM-GRAPH-02:P03-B', null);
    for (const [sid, exp] of [
      ['EXAM-GRAPH-02:P03:S06', '4'],
      ['EXAM-GRAPH-02:P03:S07', '16'],
      ['EXAM-GRAPH-02:P03:S08', 'accept_x_eq_16'],
    ]) {
      RadicalPreviewJournal.append(data, j, 'ANSWER_SUBMITTED', 'EXAM-GRAPH-02:P03-B', sid, {
        answer: exp,
        result_status: 'CORRECT',
        hint_level: 0,
      });
      completed.add(sid);
    }

    const diagAfterRetry = RadicalPreviewJournal.diagnoseSkills(data, j, completed);
    const eqSkillAfter = diagAfterRetry.skills.find((s) => s.skill_id === 'EXAM-GRAPH-02:skill.target_value_equation');
    assert.equal(eqSkillAfter.status, 'SOLID_IN_SESSION');
    assert.equal(eqSkillAfter.batch01_state, 'CRITERIA_MET_IN_SESSION');
    assert.equal(eqSkillAfter.clean_steps, 3);
  });
});

test('MIDTERM1-PHASE-A · Safe Math & XSS / KaTeX Hardening', async (t) => {
  await t.test('M1-07 Renders valid LaTeX with KaTeX and falls back safely on dangerous commands or HTML injection', () => {
    const rendered = YourdreamMath.mixed('Cho $A = \\frac{2}{\\sqrt{x}+2}$ với $x \\ge 0$.', katex);
    assert.match(rendered, /katex/);
    assert.doesNotMatch(rendered, /<script/i);

    const xss = YourdreamMath.mixed('<img src=x onerror=alert(1)> $$\\href{javascript:alert(1)}{x}$$', katex);
    assert.doesNotMatch(xss, /<img/i);
    assert.doesNotMatch(xss, /<a\b/i);
    assert.match(xss, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(xss, /class="math-fallback"/);
  });
});

test('MIDTERM1-PHASE-A · Mobile UI & Preview Controller DOM Simulation (5 Exercises / 26 Steps)', async (t) => {
  function createMockDom(innerWidth = 375) {
    const elements = new Map();
    const makeEl = (id, tag = 'div') => {
      const el = {
        id,
        tagName: tag.toUpperCase(),
        hidden: false,
        disabled: false,
        open: false,
        value: '',
        textContent: '',
        _innerHTML: '',
        className: '',
        dataset: {},
        attributes: new Map(),
        onclick: null,
        onchange: null,
        onsubmit: null,
        oninput: null,
        ontoggle: null,
        onkeydown: null,
        setAttribute(k, v) {
          this.attributes.set(k, String(v));
        },
        getAttribute(k) {
          return this.attributes.get(k) ?? null;
        },
        focus() {},
        querySelectorAll(selector) {
          return this._children || [];
        },
      };
      Object.defineProperty(el, 'innerHTML', {
        get() {
          return this._innerHTML;
        },
        set(val) {
          this._innerHTML = String(val);
          // Parse data-item, data-step, data-sub, data-retry-step, data-reset-skill-step buttons/nodes for interaction testing
          const children = [];
          const btnRe = /<(button|g|input|select)\b([^>]*)>/gi;
          let m;
          while ((m = btnRe.exec(this._innerHTML))) {
            const tagFound = m[1].toLowerCase();
            const attrs = m[2];
            const child = makeEl('', tagFound);
            for (const [attrName, propName] of [
              ['data-item', 'item'],
              ['data-step', 'step'],
              ['data-sub', 'sub'],
              ['data-retry-item', 'retryItem'],
              ['data-retry-step', 'retryStep'],
              ['data-reset-skill-item', 'resetSkillItem'],
              ['data-reset-skill-step', 'resetSkillStep'],
            ]) {
              const am = new RegExp(`${attrName}="([^"]*)"`).exec(attrs);
              if (am) child.dataset[propName] = am[1];
            }
            const nameMatch = /\bname="([^"]*)"/.exec(attrs);
            if (nameMatch) child.name = nameMatch[1];
            const valMatch = /\bvalue="([^"]*)"/.exec(attrs);
            if (valMatch) child.value = valMatch[1];
            children.push(child);
          }
          this._children = children;
        },
      });
      return el;
    };

    const ids = [
      'fixture-badge',
      'fixture-notice',
      'storage-status',
      'total-progress',
      'exercise-list',
      'workspace',
      'exercise-title',
      'exercise-prompt',
      'exercise-domain',
      'subquestion-tabs',
      'map-mode',
      'list-mode',
      'graph-scroll',
      'step-list',
      'step-map',
      'practice',
      'step-title',
      'step-state',
      'step-question',
      'locked-note',
      'answer-form',
      'answer-fields',
      'check-answer',
      'feedback',
      'hint-button',
      'hints',
      'explanation',
      'step-before',
      'step-after',
      'step-reason',
      'item-progress',
      'attempt-evidence',
      'load-error',
      'next-step',
      'reset-item',
      'profile-select',
      'skill-diagnosis',
      'diagnosis-summary',
      'diagnosis-list',
    ];
    for (const id of ids) elements.set(id, makeEl(id));
    elements.get('answer-form').querySelectorAll = () => elements.get('answer-fields')._children || [];

    const storage = new Map();
    let currentFormData = {};

    const windowObj = {
      innerWidth,
      location: { search: '' },
      RadicalEngine,
      RadicalProfiles,
      RadicalPreviewJournal,
      YourdreamMath,
      katex,
      localStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
      },
      crypto: {
        randomUUID: () => crypto.randomUUID(),
        subtle: {
          digest: async (alg, bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest(),
        },
      },
      TextEncoder,
      Uint8Array,
      URLSearchParams,
      FormData: function () {
        return {
          get: (k) => (Object.hasOwn(currentFormData, k) ? currentFormData[k] : null),
        };
      },
      fetch: async (urlPath) => {
        const clean = String(urlPath).replace(/^\//, '');
        const full = path.join(PUBLIC_DIR, clean);
        if (!fs.existsSync(full)) return { ok: false, status: 404 };
        const raw = fs.readFileSync(full, 'utf8');
        return {
          ok: true,
          status: 200,
          text: async () => raw,
          json: async () => JSON.parse(raw),
        };
      },
    };
    windowObj.document = {
      getElementById: (id) => elements.get(id) || null,
    };
    windowObj.window = windowObj;

    return {
      windowObj,
      elements,
      storage,
      setFormData(obj) {
        currentFormData = obj;
      },
    };
  }

  await t.test('M1-08 Mobile viewport (375px) defaults to Batch 02A (5 bài / 24 bước) in list mode, supports switching to TEST FIXTURE (5 bài / 26 bước), navigates subquestions, diagnoses skills with Batch 01 states, and retries', async () => {
    const env = createMockDom(375);
    const scriptCode = fs.readFileSync(path.join(PUBLIC_DIR, 'graph02-preview.js'), 'utf8');
    vm.runInNewContext(scriptCode, env.windowObj);

    await env.windowObj.YourdreamPreview.ready;

    // Defaults to midterm1-hanoi-01 (Batch 02A: 5 exercises / 24 steps) and mobile list mode
    const batch02aData = env.windowObj.YourdreamPreview.getData();
    assert.ok(batch02aData);
    assert.equal(batch02aData.graphs.length, 5);
    assert.equal(batch02aData.steps.length, 24);
    assert.deepEqual(
      Array.from(batch02aData.graphs, (g) => g.step_ids.length),
      [5, 6, 5, 5, 3]
    );
    assert.match(env.elements.get('fixture-badge').textContent, /ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN \(5 bài \/ 24 bước\)/);
    assert.match(env.elements.get('total-progress').textContent, /0 \/ 24 bước đã làm đúng · 0 \/ 5 bài hoàn thành · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN \(Batch 02A DRAFT\)/);
    assert.match(env.elements.get('exercise-title').textContent, /Bài 1 \/ 5 \(Đề luyện tập tự biên soạn · DRAFT\)/);
    assert.equal(env.elements.get('list-mode').getAttribute('aria-pressed'), 'true');
    assert.equal(env.elements.get('step-list').hidden, false);
    assert.equal(env.elements.get('graph-scroll').hidden, true);
    assert.equal(env.elements.get('workspace').hidden, false);

    // Switch to midterm1-fixture (5 exercises / 26 steps) and verify TEST FIXTURE badge
    await env.windowObj.YourdreamPreview.loadProfile('midterm1-fixture');
    const data = env.windowObj.YourdreamPreview.getData();
    assert.ok(data);
    assert.equal(data.graphs.length, 5);
    assert.equal(data.steps.length, 26);
    assert.match(env.elements.get('fixture-badge').textContent, /TEST FIXTURE/);
    assert.match(env.elements.get('total-progress').textContent, /TEST FIXTURE \(không phải đề thi giữa kỳ\)/);
    assert.match(env.elements.get('exercise-title').textContent, /TEST FIXTURE/);

    // Submit wrong choice on Bài 2 (P02:S01)
    env.windowObj.YourdreamPreview.selectItem('EXAM-GRAPH-02:P02');
    assert.equal(env.windowObj.YourdreamPreview.getState().stepId, 'EXAM-GRAPH-02:P02:S01');
    env.setFormData({ choice: 'x_ge_1' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });

    const diag1 = env.windowObj.YourdreamPreview.getSkillDiagnosis();
    assert.equal(diag1.needs_retry_count, 1);
    assert.match(env.elements.get('diagnosis-summary').textContent, /policy_version: PENDING/);
    assert.match(env.elements.get('diagnosis-summary').textContent, /1 kỹ năng cần sửa lỗi ngay/);
    assert.match(env.elements.get('diagnosis-list').innerHTML, /IN_PRACTICE_NEEDS_RETRY/);

    // Switch to Bài 5 (P04) and check subquestion tabs (shared_domain, 1, 2, 3)
    env.windowObj.YourdreamPreview.selectItem('EXAM-GRAPH-02:P04');
    assert.equal(env.elements.get('subquestion-tabs').hidden, false);
    assert.equal(env.elements.get('subquestion-tabs')._children.length, 4);

    // Use retrySkillStep from diagnosis to jump back to P02:S01 and fix the answer
    const jumped = env.windowObj.YourdreamPreview.retrySkillStep('EXAM-GRAPH-02:P02', 'EXAM-GRAPH-02:P02:S01', false);
    assert.equal(jumped, true);
    assert.equal(env.windowObj.YourdreamPreview.getState().itemId, 'EXAM-GRAPH-02:P02');
    assert.equal(env.windowObj.YourdreamPreview.getState().stepId, 'EXAM-GRAPH-02:P02:S01');

    env.setFormData({ choice: 'x_ne_1' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });
    assert.ok(env.windowObj.YourdreamPreview.getCompleted().includes('EXAM-GRAPH-02:P02:S01'));
    const diag2 = env.windowObj.YourdreamPreview.getSkillDiagnosis();
    assert.equal(diag2.needs_retry_count, 0);

    // Failed profile load clears stale state and disables workspace
    await env.windowObj.YourdreamPreview.loadProfile('non-existent-profile');
    assert.equal(env.windowObj.YourdreamPreview.getData(), null);
    assert.equal(env.elements.get('workspace').hidden, true);
    assert.equal(env.elements.get('check-answer').disabled, true);
    assert.equal(env.elements.get('load-error').hidden, false);
  });
});
