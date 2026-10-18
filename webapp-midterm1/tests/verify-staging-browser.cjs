const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const WebSocket = require('ws');
const assert = require('assert');
const path = require('path');

const STAGING_PORT = 8788;
const CDP_PORT = 9236;
const REMOTE_URL = process.env.STAGING_BASE_URL || 'https://yourdream-webapp-staging.tothanhnam.workers.dev';
const USE_LOCAL = process.argv.includes('--local');
const BASE_URL = USE_LOCAL ? `http://127.0.0.1:${STAGING_PORT}` : REMOTE_URL;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 250);
        }
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 250);
        }
      });
      socket.connect(port, '127.0.0.1');
    };
    check();
  });
}

function httpRequest(method, url, payload = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const bodyStr = payload ? JSON.stringify(payload) : null;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: bodyStr
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
          : {}
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, text: data, headers: res.headers }));
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function httpGetJson(url) {
  const res = await httpRequest('GET', url);
  try {
    return { status: res.status, body: JSON.parse(res.text), headers: res.headers };
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${res.text.slice(0, 200)}`);
  }
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.consoleLogs = [];
    this.pageErrors = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        this.consoleLogs.push({ type: msg.params.type, text });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params.exceptionDetails?.text || 'Runtime exception');
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runVerification() {
  let wranglerProc = null;
  let chromeProc = null;
  try {
    if (USE_LOCAL) {
      console.log(`[1/6] Starting local Cloudflare Worker staging server (${BASE_URL})...`);
      wranglerProc = spawn(
        process.execPath,
        [
          path.resolve(__dirname, '../node_modules/wrangler/bin/wrangler.js'),
          'dev',
          '--config',
          'wrangler.staging.json',
          '--port',
          String(STAGING_PORT),
          '--ip',
          '127.0.0.1',
          '--persist-to',
          '.wrangler/staging-state'
        ],
        {
          cwd: path.resolve(__dirname, '..'),
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      await waitForPort(STAGING_PORT, 20000);
    } else {
      console.log(`[1/6] Targeting live remote Cloudflare Worker staging URL: ${BASE_URL}`);
    }

    console.log('[2/6] Verifying Worker routes & real D1 staging API endpoints...');
    const indexRes = await httpRequest('GET', `${BASE_URL}/`);
    assert.strictEqual(indexRes.status, 200, 'Root / should return 200');
    const previewRes = await httpRequest('GET', `${BASE_URL}/graph02-preview.html`);
    assert.strictEqual(previewRes.status, 200, '/graph02-preview.html should return 200');
    assert.ok(
      previewRes.text.includes('Batch 02A') && previewRes.text.includes('5 bài / 24 bước'),
      '/graph02-preview.html must include Batch 02A and 5 bài / 24 bước title/banner'
    );

    const identityRes = await httpGetJson(`${BASE_URL}/api/me/identity`);
    assert.strictEqual(identityRes.status, 401, '/api/me/identity without auth header should return 401');
    assert.ok(identityRes.body && typeof identityRes.body === 'object', '/api/me/identity should return JSON object');

    const progressRes = await httpGetJson(`${BASE_URL}/api/me/progress`);
    assert.strictEqual(progressRes.status, 401, '/api/me/progress without auth header should return 401');
    assert.ok(progressRes.body && typeof progressRes.body === 'object', '/api/me/progress should return JSON object');
    console.log('  -> Worker + D1 API (/api/me/identity, /api/me/progress) verified:', JSON.stringify(identityRes.body));

    console.log('[3/6] Launching headless Google Chrome for real browser DOM & JS verification...');
    const userDataDir = path.resolve(__dirname, `../.wrangler/chrome-staging-profile-${Date.now()}`);
    chromeProc = spawn(
      CHROME_PATH,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${CDP_PORT}`,
        `${BASE_URL}/graph02-preview.html`
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    await waitForPort(CDP_PORT, 15000);
    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      const targets = await httpGetJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
      pageTarget = targets.body.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTarget && pageTarget.url.includes('graph02-preview.html')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!pageTarget) {
      const newRes = await httpRequest(
        'PUT',
        `http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`${BASE_URL}/graph02-preview.html`)}`
      );
      pageTarget = JSON.parse(newRes.text);
    }
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, 'Could not find page target in Chrome CDP');

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    if (!pageTarget.url.includes('graph02-preview.html')) {
      await cdp.send('Page.navigate', { url: `${BASE_URL}/graph02-preview.html` });
    }

    // Wait until Batch 02A (5 exercises, Exercise 1 has 5 steps) is loaded in DOM
    for (let i = 0; i < 50; i++) {
      const ready = await cdp.evaluate(
        `Boolean(document.getElementById('step-list')?.children?.length === 5 && document.getElementById('exercise-list')?.children?.length === 5)`
      );
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    console.log('[4/6] Auditing initial DOM state (Batch 02A: 5 bài / 24 bước, 13 skills, Batch 01 diagnosis)...');
    const initialSnap = await cdp.evaluate(`(() => {
      const sel = document.getElementById('profile-select');
      return {
        url: location.href,
        search: location.search,
        title: document.title,
        fixtureBadge: document.getElementById('fixture-badge')?.textContent?.trim(),
        fixtureNotice: document.getElementById('fixture-notice')?.textContent?.trim(),
        profileId: sel?.value,
        optionIds: sel ? [...sel.options].map((o) => o.value) : [],
        profileText: sel?.selectedOptions?.[0]?.textContent?.trim(),
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        exerciseTitle: document.getElementById('exercise-title')?.textContent?.trim(),
        exerciseCount: document.getElementById('exercise-list')?.children?.length || 0,
        stepCountEx1: document.getElementById('step-list')?.children?.length || 0,
        diagnosisSummary: document.getElementById('diagnosis-summary')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };
    })()`);

    assert.strictEqual(initialSnap.profileId, 'midterm1-hanoi-01', 'Default profile must be midterm1-hanoi-01 (Batch 02A)');
    assert.strictEqual(initialSnap.optionIds[0], 'midterm1-hanoi-01', 'First option in #profile-select must be midterm1-hanoi-01');
    assert.strictEqual(initialSnap.optionIds[1], 'midterm1-fixture', 'Second option in #profile-select must be midterm1-fixture');
    assert.strictEqual(initialSnap.search, '?profile=midterm1-hanoi-01', 'URL search must sync to ?profile=midterm1-hanoi-01');
    assert.strictEqual(initialSnap.fixtureBadge, 'DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)');
    assert.ok(initialSnap.fixtureNotice.includes('Tự biên soạn mới 100% · DRAFT'), 'Notice must state editorial provenance');
    assert.strictEqual(initialSnap.exerciseCount, 5, 'Should render 5 exercise buttons');
    assert.strictEqual(initialSnap.stepCountEx1, 5, 'Exercise 1 (Bài I) should render 5 step buttons (5+6+5+5+3=24)');
    assert.ok(
      initialSnap.totalProgress.includes('0 / 24 bước đã làm đúng · 0 / 5 bài hoàn thành · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (Batch 02A DRAFT)'),
      `Unexpected totalProgress: ${initialSnap.totalProgress}`
    );
    assert.ok(
      initialSnap.diagnosisSummary.includes('Theo dõi 13 kỹ năng trên 5 bài (24 bước) [policy_version: PENDING]'),
      `Unexpected diagnosisSummary: ${initialSnap.diagnosisSummary}`
    );
    assert.ok(
      initialSnap.diagnosisText.includes('Chưa học [NOT_STARTED]'),
      'Initial diagnosis must display Batch 01 "Chưa học [NOT_STARTED]" state'
    );
    console.log('  -> Initial DOM state verified:', JSON.stringify(initialSnap, null, 2));

    console.log('[4b/6] Verifying ?profile=midterm1-fixture (26 steps) option, selector switch to midterm1-hanoi-01 (24 steps), and F5 reload persistence...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/graph02-preview.html?profile=midterm1-fixture` });
    for (let i = 0; i < 40; i++) {
      const fixtureLoaded = await cdp.evaluate(
        `Boolean(document.getElementById('profile-select')?.value === 'midterm1-fixture' && document.getElementById('step-list')?.children?.length === 4)`
      );
      if (fixtureLoaded) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const fixtureSnap = await cdp.evaluate(`(() => ({
      search: location.search,
      profileId: document.getElementById('profile-select')?.value,
      fixtureBadge: document.getElementById('fixture-badge')?.textContent?.trim(),
      totalProgress: document.getElementById('total-progress')?.textContent?.trim()
    }))()`);
    assert.strictEqual(fixtureSnap.profileId, 'midterm1-fixture');
    assert.ok(fixtureSnap.fixtureBadge.includes('TEST FIXTURE'), 'midterm1-fixture must display TEST FIXTURE badge');
    assert.ok(fixtureSnap.totalProgress.includes('0 / 26 bước đã làm đúng'), 'midterm1-fixture must display 26 steps');

    // Switch #profile-select back to midterm1-hanoi-01 via user change event
    const switchedSnap = await cdp.evaluate(`(async () => {
      const sel = document.getElementById('profile-select');
      sel.value = 'midterm1-hanoi-01';
      await sel.onchange();
      return {
        search: location.search,
        profileId: sel.value,
        fixtureBadge: document.getElementById('fixture-badge')?.textContent?.trim(),
        totalProgress: document.getElementById('total-progress')?.textContent?.trim()
      };
    })()`);
    assert.strictEqual(switchedSnap.profileId, 'midterm1-hanoi-01');
    assert.strictEqual(switchedSnap.search, '?profile=midterm1-hanoi-01', 'Switching #profile-select must update location.search via replaceState');
    assert.strictEqual(switchedSnap.fixtureBadge, 'DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)');

    // Reload page in Chrome and verify it stays on midterm1-hanoi-01 (does NOT revert to midterm1-fixture)
    await cdp.send('Page.reload', { ignoreCache: false });
    for (let i = 0; i < 40; i++) {
      const reloaded = await cdp.evaluate(
        `Boolean(document.getElementById('profile-select')?.value === 'midterm1-hanoi-01' && document.getElementById('step-list')?.children?.length === 5)`
      );
      if (reloaded) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const afterReloadSnap = await cdp.evaluate(`(() => ({
      search: location.search,
      profileId: document.getElementById('profile-select')?.value,
      fixtureBadge: document.getElementById('fixture-badge')?.textContent?.trim(),
      totalProgress: document.getElementById('total-progress')?.textContent?.trim()
    }))()`);
    assert.strictEqual(afterReloadSnap.profileId, 'midterm1-hanoi-01', 'After Page.reload, profile must remain midterm1-hanoi-01');
    assert.strictEqual(afterReloadSnap.fixtureBadge, 'DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)');
    console.log('  -> Profile switch & reload persistence verified:', JSON.stringify({ fixtureSnap, switchedSnap, afterReloadSnap }, null, 2));

    console.log('[5/6] Exercising Batch 02A hints, wrong answer, retry, clean solve, rational input, and ITEM_RESET in real browser...');
    const interactionSnap = await cdp.evaluate(`(async () => {
      // 1. Bài I (G01) Step 1 (choice, expected "sub_correct"): submit wrong choice first
      const choices = [...document.querySelectorAll('input[name="choice"]')];
      const wrongRadio = choices.find((r) => r.value !== 'sub_correct');
      wrongRadio.checked = true;
      wrongRadio.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterWrong = {
        feedbackClass: document.getElementById('feedback')?.className,
        feedbackText: document.getElementById('feedback')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 2. Open Hint 1, Hint 2, Hint 3 on G01:S01
      document.getElementById('hint-button').click();
      document.getElementById('hint-button').click();
      document.getElementById('hint-button').click();
      const hintCount = document.getElementById('hints')?.children?.length || 0;

      // 3. Submit correct choice "sub_correct" on G01:S01 (after wrong + hints -> IN_PRACTICE_WITH_SUPPORT)
      const rightRadio = document.querySelector('input[name="choice"][value="sub_correct"]');
      rightRadio.checked = true;
      rightRadio.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterSupportedPass = {
        feedbackClass: document.getElementById('feedback')?.className,
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 4. Advance to G01:S02 (rational, expected "3") and solve with equivalent fraction "6/2"
      document.getElementById('next-step').click();
      const s02Input = document.querySelector('input[name="value"]');
      s02Input.value = '6/2';
      s02Input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterRationalPass = {
        feedbackClass: document.getElementById('feedback')?.className,
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 5. Switch to Bài II (G02, index 1) and solve S01 ("prod_correct") + S02 ("9/2") cleanly -> C08 reaches 2/2 clean steps = CRITERIA_MET_IN_SESSION
      document.querySelectorAll('#exercise-list [data-item]')[1].click();
      const g02s01 = document.querySelector('input[name="choice"][value="prod_correct"]');
      g02s01.checked = true;
      g02s01.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      document.getElementById('next-step').click();
      const g02s02 = document.querySelector('input[name="value"]');
      g02s02.value = '9/2';
      g02s02.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterCleanSkillPass = {
        feedbackClass: document.getElementById('feedback')?.className,
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 6. Trigger ITEM_RESET on Bài II ("Làm lại bài")
      document.getElementById('reset-item').click();
      const afterItemReset = {
        totalProgress: document.getElementById('total-progress')?.textContent?.trim()
      };

      return {
        afterWrong,
        hintCount,
        afterSupportedPass,
        afterRationalPass,
        afterCleanSkillPass,
        afterItemReset
      };
    })()`);

    assert.strictEqual(interactionSnap.afterWrong.feedbackClass, 'incorrect', 'Wrong choice should render incorrect feedback');
    assert.ok(
      interactionSnap.afterWrong.diagnosisText.includes('Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]'),
      'Wrong attempt must show Batch 01 state "Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]"'
    );
    assert.strictEqual(interactionSnap.hintCount, 3, 'Clicking hint button 3 times should reveal 3 hints');
    assert.strictEqual(interactionSnap.afterSupportedPass.feedbackClass, 'correct', 'Correct choice should pass');
    assert.ok(
      interactionSnap.afterSupportedPass.diagnosisText.includes('Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]'),
      'Solving after hint/wrong must show Batch 01 state "Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]"'
    );
    assert.strictEqual(
      interactionSnap.afterRationalPass.feedbackClass,
      'correct',
      'Rational input "6/2" for answer "3" should pass equivalence check'
    );
    assert.ok(
      interactionSnap.afterRationalPass.diagnosisText.includes('Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]'),
      'Partial skill progress (1/3 steps on C04) must show Batch 01 state "Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]"'
    );
    assert.strictEqual(interactionSnap.afterCleanSkillPass.feedbackClass, 'correct', 'G02:S02 rational input "9/2" should pass');
    assert.ok(
      interactionSnap.afterCleanSkillPass.diagnosisText.includes('Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]'),
      'Clean solve of all steps in C08 (G02:S01 + G02:S02) must show Batch 01 state "Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]"'
    );
    assert.ok(
      interactionSnap.afterCleanSkillPass.totalProgress.includes('4 / 24 bước đã làm đúng'),
      'Total progress should be 4 / 24 after 2 steps in Bài I and 2 steps in Bài II solved'
    );
    assert.ok(
      interactionSnap.afterItemReset.totalProgress.includes('2 / 24 bước đã làm đúng'),
      'After ITEM_RESET on Bài II, total progress should return to 2 / 24 while preserving Bài I'
    );
    assert.strictEqual(cdp.pageErrors.length, 0, `Unexpected browser runtime errors: ${cdp.pageErrors.join('; ')}`);

    console.log(`[6/6] Real browser verification against ${BASE_URL} PASSED with 0 runtime errors!`);
    console.log(JSON.stringify(interactionSnap, null, 2));
    cdp.close();
  } finally {
    if (chromeProc) chromeProc.kill();
    if (wranglerProc) wranglerProc.kill();
  }
}

runVerification().catch((err) => {
  console.error('STAGING BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
