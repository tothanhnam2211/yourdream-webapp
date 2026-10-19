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
const YourdreamErrorScaffolding = loadUmd('midterm1-error-scaffolding.js', 'YourdreamErrorScaffolding');
const YourdreamMath = loadUmd('safe-math.js', 'YourdreamMath');
const PaperSheetModule = loadUmd('paper-sheet-module.js', 'YourdreamPreview');
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
  assert.equal(catalog.default_profile, 'midterm1-hanoi-01');
  assert.equal(catalog.profiles.length, 5);
  assert.equal(catalog.profiles[0].id, 'midterm1-hanoi-01');
  assert.equal(catalog.profiles[1].id, 'midterm1-fixture');

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
  function createMockDom(innerWidth = 375, sharedStorage = null) {
    const elements = new Map();
    let lastFocusedId = null;
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
        focus() {
          lastFocusedId = this.id;
        },
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
          // Parse data-* buttons/nodes for interaction testing
          const children = [];
          const btnRe = /<(button|g|input|select)\b([^>]*)>/gi;
          let m;
          while ((m = btnRe.exec(this._innerHTML))) {
            const tagFound = m[1].toLowerCase();
            const attrs = m[2];
            const child = makeEl('', tagFound);
            child.parentElement = this;
            for (const [attrName, propName] of [
              ['data-item', 'item'],
              ['data-step', 'step'],
              ['data-sub', 'sub'],
              ['data-sub-item', 'subItem'],
              ['data-paper-item', 'paperItem'],
              ['data-paper-part', 'paperPart'],
              ['data-part-step', 'partStep'],
              ['data-action', 'action'],
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
      'paper-sheet-shell',
      'exam-paper-heading',
      'sheet-header',
      'exercise-list',
      'workspace',
      'exercise-title',
      'exercise-prompt',
      'exercise-domain',
      'subquestion-tabs',
      'step-map-details',
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
      'practice-mode-btn',
      'exam-mode-btn',
      'toggle-exam-paper',
      'exam-paper-panel',
      'submit-exam-btn',
      'exam-mode-status',
      'exam-paper-list',
      'geometry-precheck',
      'geometry-precheck-title',
      'geometry-precheck-notice',
      'geometry-precheck-list',
      'geometry-precheck-status',
      'exercise-mindmap',
      'mindmap-branches',
      'error-decision-tree',
      'error-boundary-notice',
      'error-tree-summary',
      'active-remediation-card',
      'exercise-trap-library',
      'trap-library-list',
      'model-solution-panel',
      'model-solution-note',
      'model-solution-list',
      'skill-diagnosis',
      'diagnosis-summary',
      'diagnosis-list',
    ];
    for (const id of ids) elements.set(id, makeEl(id));
    elements.get('answer-form').querySelectorAll = () => elements.get('answer-fields')._children || [];

    const storage = sharedStorage || new Map();
    let currentFormData = {};

    const windowObj = {
      innerWidth,
      location: { pathname: '/graph02-preview.html', search: '', hash: '' },
      history: {
        replaceState(_state, _title, nextUrl) {
          const qIdx = String(nextUrl).indexOf('?');
          windowObj.location.search = qIdx >= 0 ? String(nextUrl).slice(qIdx) : '';
        },
      },
      RadicalEngine,
      RadicalProfiles,
      RadicalPreviewJournal,
      YourdreamErrorScaffolding,
      YourdreamMath,
      YourdreamPreview: Object.assign({}, PaperSheetModule),
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
      title: '',
      getElementById: (id) => elements.get(id) || null,
    };
    windowObj.window = windowObj;

    return {
      windowObj,
      elements,
      storage,
      getLastFocusedId: () => lastFocusedId,
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
    assert.equal(env.elements.get('profile-select').value, 'midterm1-hanoi-01');
    assert.equal(env.windowObj.location.search, '?profile=midterm1-hanoi-01');
    assert.deepEqual(
      Array.from(batch02aData.graphs, (g) => g.step_ids.length),
      [5, 6, 5, 5, 3]
    );
    assert.match(env.elements.get('fixture-badge').textContent, /ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN \(5 bài \/ 24 bước\)/);
    assert.match(env.elements.get('total-progress').textContent, /0 \/ 24 bước đã làm đúng · 0 \/ 5 bài hoàn thành · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN \(Batch 02A DRAFT\)/);
    assert.match(env.elements.get('exercise-title').textContent, /Bài 1 \/ 5 .* \(Đề luyện tập tự biên soạn · DRAFT\)/);
    assert.equal(env.elements.get('list-mode').getAttribute('aria-pressed'), 'true');
    assert.equal(env.elements.get('step-list').hidden, false);
    assert.equal(env.elements.get('graph-scroll').hidden, true);
    assert.equal(env.elements.get('workspace').hidden, true);

    // Switch to midterm1-fixture (5 exercises / 26 steps) and verify TEST FIXTURE badge + URL sync
    await env.windowObj.YourdreamPreview.loadProfile('midterm1-fixture');
    const data = env.windowObj.YourdreamPreview.getData();
    assert.ok(data);
    assert.equal(data.graphs.length, 5);
    assert.equal(data.steps.length, 26);
    assert.equal(env.elements.get('profile-select').value, 'midterm1-fixture');
    assert.equal(env.windowObj.location.search, '?profile=midterm1-fixture');
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

  await t.test('M1-09 Five Core Student Error Types (COPYING_ERROR, SIGN_ERROR, ARITHMETIC_ERROR, METHOD_GAP, DIAGRAM_ERROR) distinguish origin layers and populate every exercise trap library', () => {
    const raw = readJson('data/midterm1-hanoi-exam01-preview.json');
    const data = RadicalProfiles.load(raw, 'lesson-contract-v01', RadicalEngine);
    assert.deepEqual(Array.from(YourdreamErrorScaffolding.ERROR_TYPE_IDS), [
      'COPYING_ERROR',
      'SIGN_ERROR',
      'ARITHMETIC_ERROR',
      'METHOD_GAP',
      'DIAGRAM_ERROR',
    ]);
    assert.equal(YourdreamErrorScaffolding.CORE_ERROR_TYPES.COPYING_ERROR.origin_layer, 'INPUT_DATA_AND_SETUP');
    assert.equal(YourdreamErrorScaffolding.CORE_ERROR_TYPES.DIAGRAM_ERROR.origin_layer, 'INPUT_DATA_AND_SETUP');
    assert.equal(YourdreamErrorScaffolding.CORE_ERROR_TYPES.METHOD_GAP.origin_layer, 'REASONING_AND_METHOD');
    assert.equal(YourdreamErrorScaffolding.CORE_ERROR_TYPES.SIGN_ERROR.origin_layer, 'REASONING_AND_METHOD');
    assert.equal(YourdreamErrorScaffolding.CORE_ERROR_TYPES.ARITHMETIC_ERROR.origin_layer, 'COMPUTATION_AND_EVALUATION');

    for (const g of data.graphs) {
      const traps = YourdreamErrorScaffolding.getExerciseTrapLibrary(data, g.item_id);
      assert.equal(traps.length, 5, `Exercise ${g.item_id} must have 5 core error traps`);
      assert.deepEqual(
        Array.from(traps, (tr) => tr.error_type),
        ['COPYING_ERROR', 'SIGN_ERROR', 'ARITHMETIC_ERROR', 'METHOD_GAP', 'DIAGRAM_ERROR']
      );
      for (const tr of traps) {
        assert.ok(tr.detection_question && tr.detection_question.length > 10);
        assert.equal(tr.hints.length, 3);
        assert.ok(tr.self_correction_activity && tr.self_correction_activity.length > 10);
        assert.ok(tr.model_correction && tr.model_correction.length > 10);
        assert.ok(tr.exam_prevention_rule && tr.exam_prevention_rule.length > 10);
        assert.ok(g.step_ids.includes(tr.linked_step_id));
      }
    }
  });

  await t.test('M1-10 Scaffolding Decision Tree allows multiple concurrent errors but assigns ONLY 1 priority task per turn (earliest step with evidence first)', async () => {
    const env = createMockDom(375);
    const scriptCode = fs.readFileSync(path.join(PUBLIC_DIR, 'graph02-preview.js'), 'utf8');
    vm.runInNewContext(scriptCode, env.windowObj);
    await env.windowObj.YourdreamPreview.ready;

    // 1. On Bài I Step 1 (G01:S01), submit "sub_no_paren" -> COPYING_ERROR at Step 1
    env.setFormData({ choice: 'sub_no_paren' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });

    // 2. Also on Bài I Step 3 (G01:S03, independent root step), submit "sys_std_const1" -> ARITHMETIC_ERROR at Step 3
    env.windowObj.YourdreamPreview.selectStep('YD-G09-MID1-01:G01:S03');
    env.setFormData({ choice: 'sys_std_const1' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });

    const errDiag1 = env.windowObj.YourdreamPreview.getErrorDiagnosis();
    assert.equal(errDiag1.total_active_errors, 2, 'Should record both concurrent errors');
    assert.equal(errDiag1.queued_errors_count, 1, '1 error should be queued for the next turn');
    assert.ok(errDiag1.active_remediation_task, 'Must emit a single active_remediation_task');
    assert.equal(errDiag1.active_remediation_task.step_id, 'YD-G09-MID1-01:G01:S01', 'Earliest step (S01) must be prioritized first');
    assert.equal(errDiag1.active_remediation_task.error_type, 'COPYING_ERROR');
    assert.match(env.elements.get('active-remediation-card').innerHTML, /COPYING_ERROR/);

    // 3. Student fixes Step 1 (G01:S01) with "sub_correct" -> active task advances to Step 3 (ARITHMETIC_ERROR)
    env.windowObj.YourdreamPreview.selectStep('YD-G09-MID1-01:G01:S01');
    env.setFormData({ choice: 'sub_correct' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });

    const errDiag2 = env.windowObj.YourdreamPreview.getErrorDiagnosis();
    assert.equal(errDiag2.total_active_errors, 1);
    assert.equal(errDiag2.queued_errors_count, 0);
    assert.equal(errDiag2.active_remediation_task.step_id, 'YD-G09-MID1-01:G01:S03');
    assert.equal(errDiag2.active_remediation_task.error_type, 'ARITHMETIC_ERROR');
  });

  await t.test('M1-11 Geometry exercise (Bài IV) displays Pre-Solve Hypothesis/Symbol/Diagram Checklist, classifies DIAGRAM_ERROR, and supports Mock Exam Mode', async () => {
    const env = createMockDom(375);
    const scriptCode = fs.readFileSync(path.join(PUBLIC_DIR, 'graph02-preview.js'), 'utf8');
    vm.runInNewContext(scriptCode, env.windowObj);
    await env.windowObj.YourdreamPreview.ready;

    // Switch to Bài IV (Geometry: YD-G09-MID1-01:G04)
    env.windowObj.YourdreamPreview.selectItem('YD-G09-MID1-01:G04');
    assert.equal(env.elements.get('geometry-precheck').hidden, false, 'Geometry pre-solve checklist must be visible on Bài IV');
    assert.match(env.elements.get('geometry-precheck-status').textContent, /0\/4 chốt hình học/);

    env.windowObj.YourdreamPreview.toggleGeometryCheck('GEO_CHK_01_RIGHT_ANGLES', true);
    env.windowObj.YourdreamPreview.toggleGeometryCheck('GEO_CHK_02_LADDER_ANGLE', true);
    env.windowObj.YourdreamPreview.toggleGeometryCheck('GEO_CHK_03_PROJECTIONS', true);
    env.windowObj.YourdreamPreview.toggleGeometryCheck('GEO_CHK_04_SIMILARITY_ORDER', true);
    assert.match(env.elements.get('geometry-precheck-status').textContent, /Đã đối chiếu đủ 4\/4 chốt/);

    // Submit wrong choice on G04:S01 ("ladder_sin_30" -> C14_CONFUSE_ADJACENT_WITH_OPPOSITE_SIDE) -> DIAGRAM_ERROR
    env.setFormData({ choice: 'ladder_sin_30' });
    env.elements.get('answer-form').onsubmit({ preventDefault() {} });
    const geoErr = env.windowObj.YourdreamPreview.getErrorDiagnosis();
    assert.equal(geoErr.active_remediation_task.error_type, 'DIAGRAM_ERROR');
    assert.equal(geoErr.active_remediation_task.origin_layer, 'INPUT_DATA_AND_SETUP');

    // Test Mock Exam Mode: locks hints & model solution until submitMockExam()
    env.windowObj.YourdreamPreview.setExamMode('exam');
    assert.equal(env.elements.get('exam-paper-panel').hidden, false);
    assert.equal(env.elements.get('hint-button').disabled, true);
    assert.match(env.elements.get('model-solution-note').textContent, /Lời giải mẫu hoàn chỉnh được khóa/);

    const examDiag = env.windowObj.YourdreamPreview.submitMockExam();
    assert.ok(examDiag);
    assert.match(env.elements.get('model-solution-note').textContent, /Lời giải mẫu hoàn chỉnh gồm 5 bước/);
  });

  for (const width of [1280, 375]) await t.test(`Paper-first ${width}: entry hides workspace; clicks reveal one support panel; return/reload preserve drafts; exam blocks support`, async () => {
    const storage = new Map();
    const env = createMockDom(width, storage);
    const code = fs.readFileSync(path.join(PUBLIC_DIR, 'graph02-preview.js'), 'utf8');
    vm.runInNewContext(code, env.windowObj);
    await env.windowObj.YourdreamPreview.ready;
    const app = env.windowObj.YourdreamPreview;
    assert.equal(env.elements.get('workspace').hidden, true);
    assert.equal(env.elements.get('exam-paper-panel').hidden, false);
    const supportIds = ['step-map-details', 'exercise-mindmap', 'error-decision-tree', 'exercise-trap-library', 'model-solution-panel', 'skill-diagnosis'];
    for (const id of supportIds) assert.equal(env.elements.get(id).hidden, true);
    const part = env.elements.get('exam-paper-list')._children.find(b => b.dataset.paperItem === 'YD-G09-MID1-01:G01' && b.dataset.paperPart === 'y_1');
    part.onclick();
    assert.equal(env.elements.get('workspace').hidden, false);
    env.setFormData({choice: 'sub_correct'});
    env.elements.get('answer-form').onchange();
    const stepId = app.getState().stepId;
    assert.equal(app.openSupportPanel('exercise-mindmap'), true);
    assert.equal(env.elements.get('exercise-mindmap').hidden, false);
    assert.equal(env.elements.get('exercise-mindmap').open, true);
    assert.equal(app.openSupportPanel('model-solution-panel'), true);
    assert.equal(env.elements.get('exercise-mindmap').hidden, true);
    assert.equal(env.elements.get('model-solution-panel').hidden, false);
    assert.equal(app.getState().stepId, stepId);
    assert.equal(app.getState().drafts[stepId], 'sub_correct');
    app.openPaperView();
    assert.equal(env.elements.get('workspace').hidden, true);
    for (const id of supportIds) assert.equal(env.elements.get(id).hidden, true);
    // Reopening from the menu must start on the paper even after a sheet was saved.
    app.selectPart('YD-G09-MID1-01:G01', 'y_1');
    const reopened = createMockDom(width, storage);
    vm.runInNewContext(code, reopened.windowObj);
    await reopened.windowObj.YourdreamPreview.ready;
    assert.equal(reopened.elements.get('workspace').hidden, true);
    assert.equal(reopened.windowObj.YourdreamPreview.getState().drafts[stepId], 'sub_correct');
    assert.equal(app.setExamMode('exam'), true);
    for (const id of supportIds) {
      assert.equal(app.openSupportPanel(id), false);
      assert.equal(env.elements.get(id).hidden, true);
    }
    assert.ok(app.submitMockExam());
    assert.equal(app.openSupportPanel('model-solution-panel'), true);
    assert.equal(env.elements.get('model-solution-panel').hidden, false);
  });

  await t.test('M1-12 WEBAPP-PAPER-UX-001 (A-F): Exam Paper primary view, subquestion_step_groups (including y_2a/y_2b/y_2c of G04), draft/answer persistence across part switches & reload, collapsed support panels, and scoped PaperSheetModule without duplicate listeners', async () => {
    const sharedStorage = new Map();
    const env = createMockDom(375, sharedStorage);
    const scriptCode = fs.readFileSync(path.join(PUBLIC_DIR, 'graph02-preview.js'), 'utf8');
    vm.runInNewContext(scriptCode, env.windowObj);
    await env.windowObj.YourdreamPreview.ready;

    // Criterion A: Initial view is Exam Paper ('paper') with all 5 exercises and subquestion_step_groups rendered
    assert.equal(env.windowObj.YourdreamPreview.getActiveView(), 'paper');
    assert.equal(env.elements.get('paper-sheet-shell').getAttribute('data-mobile-view'), 'paper');
    assert.equal(env.elements.get('exam-paper-panel').hidden, false);
    assert.match(env.elements.get('storage-status').textContent, /Đã lưu thử trên trình duyệt này · chưa lưu máy chủ/);

    const paperBtns = env.elements.get('exam-paper-list')._children.filter((c) => c.dataset.paperPart);
    // Batch 02A has parts: G01(2) + G02(3) + G03(2) + G04(4: y_1, y_2a, y_2b, y_2c) + G05(2) = 13 part buttons
    assert.equal(paperBtns.length, 13);
    const g04Parts = paperBtns.filter((c) => c.dataset.paperItem === 'YD-G09-MID1-01:G04').map((c) => c.dataset.paperPart);
    assert.deepEqual(g04Parts, ['y_1', 'y_2a', 'y_2b', 'y_2c']);

    // Criterion E: All support panels are collapsed (open === false) by default
    for (const pid of ['step-map-details', 'exercise-mindmap', 'error-decision-tree', 'exercise-trap-library', 'model-solution-panel', 'skill-diagnosis']) {
      assert.equal(env.elements.get(pid).open, false, `${pid} must default to closed`);
    }

    // Criterion B: Enter a draft on Bài 1 · y_1 (G01:S01) without submitting
    env.setFormData({ choice: 'sub_correct' });
    env.elements.get('answer-form').onchange();
    assert.equal(env.windowObj.YourdreamPreview.getState().drafts['YD-G09-MID1-01:G01:S01'], 'sub_correct');

    // Student manually opens exercise-mindmap on Bài 1, then clicks Bài 4 · y_2b on Exam Paper
    env.elements.get('exercise-mindmap').open = true;
    const g04y2bBtn = paperBtns.find((c) => c.dataset.paperItem === 'YD-G09-MID1-01:G04' && c.dataset.paperPart === 'y_2b');
    assert.ok(g04y2bBtn);
    g04y2bBtn.onclick();

    // Verify Answer Sheet opened for Bài 4 · Ý 2b [y_2b], focused #exercise-title, and collapsed support panels
    assert.equal(env.windowObj.YourdreamPreview.getActiveView(), 'sheet');
    assert.equal(env.elements.get('paper-sheet-shell').getAttribute('data-mobile-view'), 'sheet');
    assert.equal(env.windowObj.YourdreamPreview.getState().itemId, 'YD-G09-MID1-01:G04');
    assert.equal(env.windowObj.YourdreamPreview.getState().activePartKey, 'y_2b');
    assert.equal(env.windowObj.YourdreamPreview.getState().stepId, 'YD-G09-MID1-01:G04:S03');
    assert.equal(env.getLastFocusedId(), 'exercise-title');
    assert.match(env.elements.get('exercise-title').textContent, /Bài 4 \/ 5 · Ý 2b/);
    assert.match(env.elements.get('sheet-header').innerHTML, /Đang làm: Bài 4 · Ý 2b/);
    assert.equal(env.elements.get('exercise-mindmap').open, false, 'Switching exercise must not keep help panels open');

    // Click "← Quay lại tờ đề" inside sheet-header -> switches back to 'paper' and focuses #exam-paper-heading
    const backBtn = env.elements.get('sheet-header')._children.find((c) => c.dataset.action === 'back-to-paper');
    assert.ok(backBtn);
    backBtn.onclick();
    assert.equal(env.windowObj.YourdreamPreview.getActiveView(), 'paper');
    assert.equal(env.elements.get('paper-sheet-shell').getAttribute('data-mobile-view'), 'paper');
    assert.equal(env.getLastFocusedId(), 'exam-paper-heading');

    // Switch across parts 15 times to verify zero duplicate listeners on PaperSheetModule
    for (let i = 0; i < 15; i++) {
      env.windowObj.YourdreamPreview.selectPart('YD-G09-MID1-01:G04', i % 2 === 0 ? 'y_2a' : 'y_2c');
    }
    const mod = env.windowObj.YourdreamPreview.getPaperSheetModule();
    assert.ok(mod);
    assert.equal(mod.getListenerMountCount(), 1, 'PaperSheetModule must attach delegated listeners only once');

    // Simulate F5 reload with sharedStorage and verify draft on G01:S01 and activePartKey on G04 are preserved
    const envReload = createMockDom(375, sharedStorage);
    vm.runInNewContext(scriptCode, envReload.windowObj);
    await envReload.windowObj.YourdreamPreview.ready;

    const restoredState = envReload.windowObj.YourdreamPreview.getState();
    assert.equal(restoredState.drafts['YD-G09-MID1-01:G01:S01'], 'sub_correct', 'Draft must survive part switches and F5 reload');
    assert.equal(restoredState.itemId, 'YD-G09-MID1-01:G04');
    assert.equal(restoredState.activePartKey, 'y_2a');
    assert.equal(
      sha256File('data/midterm1-hanoi-exam01-preview.json'),
      '25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99',
      'Batch 02A JSON SHA256 must remain untouched'
    );
  });
  await t.test('P0 navigation · deep-linked part, draft restore, exam reload and cross-profile gate', async () => {
    const Navigation=loadUmd('learning-navigation.js','YourdreamNavigation');
    const sharedStorage=new Map();
    const scriptCode=fs.readFileSync(path.join(PUBLIC_DIR,'graph02-preview.js'),'utf8');
    async function open(search){
      const env=createMockDom(375,sharedStorage);
      env.windowObj.location.search=search;
      env.windowObj.addEventListener=()=>{};
      env.windowObj.YourdreamNavigation=Navigation;
      env.windowObj.localStorage.removeItem=k=>sharedStorage.delete(k);
      env.elements.set('yd-support-actions',{innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[]});
      vm.runInNewContext(scriptCode,env.windowObj);await env.windowObj.YourdreamPreview.ready;
      assert.equal(env.elements.get('load-error').hidden,true,env.elements.get('load-error').textContent);
      return env;
    }
    const env=await open('?profile=midterm1-hanoi-01&graph_id=YD-G09-MID1-01:G04&part=y_2b&view=sheet');
    const api=env.windowObj.YourdreamPreview;
    assert.equal(api.getState().itemId,'YD-G09-MID1-01:G04');
    assert.equal(api.getState().activePartKey,'y_2b');
    assert.equal(api.getState().stepId,'YD-G09-MID1-01:G04:S03');
    api.selectPart('YD-G09-MID1-01:G01','y_1');env.setFormData({choice:'sub_correct'});env.elements.get('answer-form').oninput();
    assert.equal(api.setExamMode('exam'),true);
    assert.equal(api.setExamMode('practice'),false);
    assert.equal(env.elements.get('practice-mode-btn').disabled,true);
    const reloaded=await open('?profile=legacy');
    const next=reloaded.windowObj.YourdreamPreview;
    assert.equal(next.getData().package_id,'YD-G09-MIDTERM1-HANOI-PRACTICE-EXAM-01');
    assert.equal(next.getState().drafts['YD-G09-MID1-01:G01:S01'],'sub_correct');
    assert.equal(reloaded.elements.get('hint-button').disabled,true);
    assert.equal(reloaded.elements.get('step-after').innerHTML,'');
    assert.equal(reloaded.elements.get('profile-select').disabled,true);
    assert.match(reloaded.elements.get('total-progress').textContent,/đã ghi bài làm/);
    await next.loadProfile('legacy');
    assert.equal(next.getData().package_id,'YD-G09-MIDTERM1-HANOI-PRACTICE-EXAM-01');
    assert.equal(next.setExamMode('practice'),false);
    next.submitMockExam();
    assert.equal(Navigation.examSession(reloaded.windowObj.localStorage),null);
    assert.equal(next.setExamMode('practice'),true);
  });

});

