const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');
const assert = require('assert');
const path = require('path');

const STAGING_PORT = 8788;
const CDP_PORT = 9235;
const BASE_URL = `http://127.0.0.1:${STAGING_PORT}`;
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

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function httpRequest(method, url, payload = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = payload ? JSON.stringify(payload) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
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
  let edgeProc = null;
  try {
    console.log('[1/6] Starting local Cloudflare Worker staging server (wrangler.staging.json on 127.0.0.1:8788)...');
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
    console.log('  -> Worker staging server listening on', BASE_URL);

    console.log('[2/6] Verifying Worker routes & isolated D1 API endpoints...');
    const indexRes = await httpRequest('GET', `${BASE_URL}/`);
    assert.strictEqual(indexRes.status, 200, 'Root / should return 200');
    const previewRes = await httpRequest('GET', `${BASE_URL}/graph02-preview.html`);
    assert.strictEqual(previewRes.status, 200, '/graph02-preview.html should return 200');
    assert.ok(previewRes.text.includes('TEST FIXTURE'), '/graph02-preview.html must include TEST FIXTURE banner');

    const identityRes = await httpGetJson(`${BASE_URL}/api/me/identity`);
    assert.strictEqual(identityRes.status, 401, '/api/me/identity without auth header should return 401');
    assert.ok(identityRes.body && typeof identityRes.body === 'object', '/api/me/identity should return JSON object');

    const progressRes = await httpGetJson(`${BASE_URL}/api/me/progress`);
    assert.strictEqual(progressRes.status, 401, '/api/me/progress without auth header should return 401');
    assert.ok(progressRes.body && typeof progressRes.body === 'object', '/api/me/progress should return JSON object');
    console.log('  -> Worker + isolated D1 API (/api/me/identity, /api/me/progress) verified:', JSON.stringify(identityRes.body));

    console.log('[3/6] Launching headless Google Chrome for real browser DOM & JS verification...');
    const userDataDir = path.resolve(__dirname, `../.wrangler/chrome-staging-profile-${Date.now()}`);
    edgeProc = spawn(
      CHROME_PATH,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${CDP_PORT}`,
        `${BASE_URL}/graph02-preview.html?profile=MIDTERM1_FIXTURE_5BAI_26BUOC`
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
        `http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(
          `${BASE_URL}/graph02-preview.html?profile=MIDTERM1_FIXTURE_5BAI_26BUOC`
        )}`
      );
      pageTarget = JSON.parse(newRes.text);
    }
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, 'Could not find page target in Chrome CDP');

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    if (!pageTarget.url.includes('graph02-preview.html')) {
      await cdp.send('Page.navigate', {
        url: `${BASE_URL}/graph02-preview.html?profile=MIDTERM1_FIXTURE_5BAI_26BUOC`
      });
    }

    // Wait until fixture is loaded in DOM
    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate(
        `Boolean(document.getElementById('step-list')?.children?.length === 4 && document.getElementById('exercise-list')?.children?.length === 5)`
      );
      if (ready) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log('[4/6] Auditing initial DOM state (TEST FIXTURE labels, 5 exercises, 26 steps, Batch 01 diagnosis)...');
    const initialSnap = await cdp.evaluate(`(() => {
      return {
        title: document.title,
        fixtureBadge: document.getElementById('fixture-badge')?.textContent?.trim(),
        fixtureNotice: document.getElementById('fixture-notice')?.textContent?.trim(),
        profileText: document.getElementById('profile-select')?.selectedOptions?.[0]?.textContent?.trim(),
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        exerciseTitle: document.getElementById('exercise-title')?.textContent?.trim(),
        exerciseCount: document.getElementById('exercise-list')?.children?.length || 0,
        stepCountEx1: document.getElementById('step-list')?.children?.length || 0,
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };
    })()`);

    assert.ok(initialSnap.title.includes('TEST FIXTURE'), 'Document title must contain TEST FIXTURE');
    assert.strictEqual(initialSnap.fixtureBadge, 'DRAFT · TEST FIXTURE (5 bài / 26 bước)');
    assert.ok(initialSnap.fixtureNotice.includes('TEST FIXTURE'), 'Fixture notice must state TEST FIXTURE');
    assert.ok(initialSnap.profileText.includes('TEST FIXTURE'), 'Profile selector must state TEST FIXTURE');
    assert.strictEqual(initialSnap.exerciseCount, 5, 'Should render 5 exercise buttons');
    assert.strictEqual(initialSnap.stepCountEx1, 4, 'Exercise 1 should render 4 step buttons (4+5+6+5+6=26)');
    assert.ok(
      initialSnap.totalProgress.includes('0 / 26 bước đã làm đúng · 0 / 5 bài hoàn thành · TEST FIXTURE'),
      `Unexpected totalProgress: ${initialSnap.totalProgress}`
    );
    assert.ok(
      initialSnap.exerciseTitle.includes('(TEST FIXTURE)'),
      `Exercise title must include (TEST FIXTURE): ${initialSnap.exerciseTitle}`
    );
    assert.ok(
      initialSnap.diagnosisText.includes('Chưa học [NOT_STARTED]'),
      'Initial diagnosis must display Batch 01 "Chưa học [NOT_STARTED]" state'
    );
    console.log('  -> Initial DOM state verified:', JSON.stringify(initialSnap, null, 2));

    console.log('[5/6] Exercising hints, wrong answer, retry, clean solve, rational input, and ITEM_RESET in real browser...');
    const interactionSnap = await cdp.evaluate(`(async () => {
      // 1. Exercise 1 Step 1 (rational, expected "3"): submit wrong value "9" first
      const step1Input = document.querySelector('input[name="value"]');
      step1Input.value = '9';
      step1Input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterWrong = {
        feedbackClass: document.getElementById('feedback')?.className,
        feedbackText: document.getElementById('feedback')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 2. Open Hint 1, Hint 2, Hint 3 on Exercise 1 Step 1
      document.getElementById('hint-button').click();
      document.getElementById('hint-button').click();
      document.getElementById('hint-button').click();
      const hintCount = document.getElementById('hints')?.children?.length || 0;

      // 3. Submit equivalent rational value "6/2" (= 3) on Exercise 1 Step 1 (after wrong + hints -> IN_PRACTICE_WITH_SUPPORT)
      const step1RetryInput = document.querySelector('input[name="value"]');
      step1RetryInput.value = '6/2';
      step1RetryInput.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterSupportedPass = {
        feedbackClass: document.getElementById('feedback')?.className,
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 4. Advance to Exercise 1 Step 2 (rational, expected "-4") and solve cleanly -> 1/2 steps on cube_root_power_identity = INSUFFICIENT_EVIDENCE
      document.getElementById('next-step').click();
      const step2Input = document.querySelector('input[name="value"]');
      step2Input.value = '-4';
      step2Input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterPartialSkillPass = {
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // Complete Step 3 (rational, expected "-4") and Step 4 (rational, expected "3") cleanly -> 2/2 steps on cube_root_power_identity = CRITERIA_MET_IN_SESSION
      document.getElementById('next-step').click();
      const step3Input = document.querySelector('input[name="value"]');
      step3Input.value = '-4';
      step3Input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      document.getElementById('next-step').click();
      const step4Input = document.querySelector('input[name="value"]');
      step4Input.value = '3';
      step4Input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterCleanPass = {
        totalProgress: document.getElementById('total-progress')?.textContent?.trim(),
        diagnosisText: document.getElementById('skill-diagnosis')?.textContent?.trim()
      };

      // 5. Switch to Exercise 2 (index 1) -> Step 1 (choice, expected "x_ne_1") and Step 2 (choice, expected "rad_gt_0")
      document.querySelectorAll('#exercise-list [data-item]')[1].click();
      const ex2Step1Right = document.querySelector('input[name="choice"][value="x_ne_1"]');
      ex2Step1Right.checked = true;
      ex2Step1Right.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      document.getElementById('next-step').click();
      const ex2Step2Right = document.querySelector('input[name="choice"][value="rad_gt_0"]');
      ex2Step2Right.checked = true;
      ex2Step2Right.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('answer-form').requestSubmit();

      const afterChoicePass = {
        feedbackClass: document.getElementById('feedback')?.className,
        totalProgress: document.getElementById('total-progress')?.textContent?.trim()
      };

      // 6. Trigger ITEM_RESET on Exercise 2 ("Làm lại bài")
      document.getElementById('reset-item').click();
      const afterItemReset = {
        totalProgress: document.getElementById('total-progress')?.textContent?.trim()
      };

      return {
        afterWrong,
        hintCount,
        afterSupportedPass,
        afterPartialSkillPass,
        afterCleanPass,
        afterChoicePass,
        afterItemReset
      };
    })()`);

    assert.strictEqual(interactionSnap.afterWrong.feedbackClass, 'incorrect', 'Wrong answer should render incorrect feedback');
    assert.ok(
      interactionSnap.afterWrong.diagnosisText.includes('Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]'),
      'Wrong attempt must show Batch 01 state "Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]"'
    );
    assert.strictEqual(interactionSnap.hintCount, 3, 'Clicking hint button 3 times should reveal 3 hints');
    assert.strictEqual(
      interactionSnap.afterSupportedPass.feedbackClass,
      'correct',
      'Rational input "6/2" for answer "3" should pass equivalence check'
    );
    assert.ok(
      interactionSnap.afterSupportedPass.diagnosisText.includes('Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]'),
      'Solving after hint/wrong must show Batch 01 state "Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]"'
    );
    assert.ok(
      interactionSnap.afterPartialSkillPass.diagnosisText.includes('Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]'),
      'Partial skill progress (1/2 steps) must show Batch 01 state "Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]"'
    );
    assert.ok(
      interactionSnap.afterCleanPass.diagnosisText.includes('Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]'),
      'Clean solve of all steps in skill must show Batch 01 state "Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]"'
    );
    assert.ok(
      interactionSnap.afterCleanPass.totalProgress.includes('4 / 26 bước đã làm đúng · 1 / 5 bài hoàn thành'),
      'Total progress should be 4 / 26 and 1 / 5 exercise completed after Exercise 1 solved'
    );
    assert.strictEqual(
      interactionSnap.afterChoicePass.feedbackClass,
      'correct',
      'Choice selection on Exercise 2 should pass'
    );
    assert.ok(
      interactionSnap.afterChoicePass.totalProgress.includes('6 / 26 bước đã làm đúng'),
      'Total progress should be 6 / 26 after Exercise 2 Steps 1-2 solved'
    );
    assert.ok(
      interactionSnap.afterItemReset.totalProgress.includes('4 / 26 bước đã làm đúng · 1 / 5 bài hoàn thành'),
      'After ITEM_RESET on Exercise 2, total progress should return to 4 / 26 while preserving Exercise 1'
    );
    assert.strictEqual(cdp.pageErrors.length, 0, `Unexpected browser runtime errors: ${cdp.pageErrors.join('; ')}`);

    console.log('[6/6] Real browser verification PASSED with 0 runtime errors!');
    console.log(JSON.stringify(interactionSnap, null, 2));
    cdp.close();
  } finally {
    if (edgeProc) edgeProc.kill();
    if (wranglerProc) wranglerProc.kill();
  }
}

runVerification().catch((err) => {
  console.error('STAGING BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
