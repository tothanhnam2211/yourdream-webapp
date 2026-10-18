'use strict';
const { createService, DomainError } = require('./service.cjs');
const defaultEngine = require('../vendor/radicals-engine.cjs');

const DEFAULT_SHA256 = 'a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2';
const DEFAULT_SITE_ID = 'appgprj_6ad181ec04e4819184ffd9a4d45d518e';
const MAX_BODY_BYTES = 16384;
const SYNTHETIC_SUBJECTS = new Set(['A', 'B', 'S', 'T', 'P']);
const SUBJECT_RE = /^[A-Za-z0-9:._-]{1,100}$/;
const FORBIDDEN_CLIENT_HEADERS = [
  'x-learner-id',
  'x-principal-id',
  'x-subject-id',
  'x-site-subject-id',
  'x-user-role',
  'x-role',
  'x-user-email',
  'x-account-id',
];

let cachedDefaultRawContent = null;
function getDefaultRawContent() {
  if (!cachedDefaultRawContent) {
    const fs = require('node:fs');
    const path = require('node:path');
    cachedDefaultRawContent = fs.readFileSync(
      path.join(__dirname, '../vendor/radical-steps-v0.1.json'),
      'utf8'
    );
  }
  return cachedDefaultRawContent;
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function baseHeaders(extra = {}) {
  return {
    'cache-control': 'private, no-store',
    'pragma': 'no-cache',
    'vary': 'Cookie, Origin, Sec-Fetch-Site',
    'x-content-type-options': 'nosniff',
    'content-type': 'application/json; charset=utf-8',
    ...extra,
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders(extraHeaders),
  });
}

function rejectUntrustedClientHeaders(request) {
  for (const h of FORBIDDEN_CLIENT_HEADERS) {
    if (request.headers.has(h)) {
      throw new DomainError(400, 'UNTRUSTED_IDENTITY_HEADER');
    }
  }
}

function verifySameOriginMutation(request, requestUrl) {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite.toLowerCase() !== 'same-origin') {
    throw new DomainError(403, 'CSRF_FORBIDDEN');
  }

  const origin = request.headers.get('origin');
  if (origin) {
    if (origin !== requestUrl.origin) {
      throw new DomainError(403, 'CSRF_FORBIDDEN');
    }
  } else if (!secFetchSite || secFetchSite.toLowerCase() !== 'same-origin') {
    const referer = request.headers.get('referer');
    if (!referer) {
      throw new DomainError(403, 'CSRF_FORBIDDEN');
    }
    let refererUrl;
    try {
      refererUrl = new URL(referer);
    } catch {
      throw new DomainError(403, 'CSRF_FORBIDDEN');
    }
    if (refererUrl.origin !== requestUrl.origin) {
      throw new DomainError(403, 'CSRF_FORBIDDEN');
    }
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
}

async function readBoundedJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declared = Number(contentLengthHeader);
    if (!Number.isFinite(declared) || declared < 0) {
      throw new DomainError(400, 'INVALID_CONTENT_LENGTH');
    }
    if (declared > maxBytes) {
      throw new DomainError(413, 'TOO_LARGE');
    }
  }

  if (!request.body) {
    throw new DomainError(400, 'INVALID_JSON');
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          throw new DomainError(413, 'TOO_LARGE');
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  if (total === 0) {
    throw new DomainError(400, 'INVALID_JSON');
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(merged);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError(400, 'INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DomainError(400, 'INVALID_SHAPE');
  }
  return parsed;
}

/**
 * Resolves trusted server identity from the platform helper result (`getChatGPTUser()`).
 * Never trusts client headers, body fields, query params, email as key, or workspace account IDs.
 */
function resolveTrustedIdentity(
  user,
  { forbidSyntheticSubjects = true, siteId = DEFAULT_SITE_ID } = {}
) {
  if (
    !user ||
    typeof user !== 'object' ||
    typeof user.userId !== 'string' ||
    !user.userId ||
    typeof user.email !== 'string' ||
    !user.email
  ) {
    throw new DomainError(401, 'AUTH_REQUIRED');
  }
  const subject = user.userId.trim();
  if (!SUBJECT_RE.test(subject)) {
    throw new DomainError(401, 'AUTH_REQUIRED');
  }
  if (subject.startsWith('appgprj_') || subject === siteId) {
    throw new DomainError(403, 'WORKSPACE_ID_NOT_SESSION_SUBJECT');
  }
  if (
    forbidSyntheticSubjects &&
    (SYNTHETIC_SUBJECTS.has(subject) || SYNTHETIC_SUBJECTS.has(subject.toUpperCase()))
  ) {
    throw new DomainError(403, 'SYNTHETIC_SUBJECT_FORBIDDEN');
  }
  return { subject };
}

/**
 * Explicit, verified pilot_operator bootstrap outside schema migrations.
 * Runs ONLY when `pilotOperatorSubject` is explicitly configured and matches the
 * authenticated platform subject. Never grants admin to the first visitor, never
 * equates workspace account_user_id, and never promotes content from DRAFT.
 */
async function ensureVerifiedPilotOperatorAndDraftContent(
  db,
  { siteId, subject, pilotOperatorSubject, rawContent, sha256 }
) {
  if (typeof pilotOperatorSubject !== 'string' || !pilotOperatorSubject.trim()) {
    return false;
  }
  const allowedSubjects = pilotOperatorSubject
    .split(',')
    .map((s) => s.trim())
    .filter(
      (s) =>
        Boolean(s) &&
        SUBJECT_RE.test(s) &&
        !SYNTHETIC_SUBJECTS.has(s) &&
        !SYNTHETIC_SUBJECTS.has(s.toUpperCase()) &&
        !s.startsWith('appgprj_') &&
        s !== siteId
    );
  if (!allowedSubjects.includes(subject)) {
    return false;
  }

  const data = JSON.parse(rawContent);
  const contentKey = `${data.package_id}:${data.version}:${sha256}`;
  const now = new Date().toISOString();
  const digest = (await sha256Hex(`${siteId}:${subject}`)).slice(0, 24);
  const principalId = `p_op_${digest}`;
  const learnerId = `l_op_${digest}`;
  const grantId = `g_op_${digest}`;
  const receiptId = `r_op_${digest}`;

  const q = (sql, ...args) => db.prepare(sql).bind(...args);
  await db.batch([
    q(
      `INSERT OR IGNORE INTO content_versions (content_key, package_id, version, sha256, review_state, manifest_ref, validator_version, withdrawn_at)
       VALUES (?, ?, ?, ?, 'DRAFT', 'verified-pilot-operator-seed', 'radicals-engine:rad04', NULL)`,
      contentKey,
      data.package_id,
      data.version,
      sha256
    ),
    q(
      `INSERT OR IGNORE INTO principals (principal_id, site_id, site_subject_id, status, created_at)
       VALUES (?, ?, ?, 'ACTIVE', ?)`,
      principalId,
      siteId,
      subject,
      now
    ),
    q(
      `INSERT OR IGNORE INTO learner_profiles (learner_id, principal_id, status)
       VALUES (?, ?, 'ACTIVE')`,
      learnerId,
      principalId
    ),
    q(
      `INSERT OR IGNORE INTO role_grants (grant_id, principal_id, role, scope_type, scope_id, granted_by, revoked_at)
       VALUES (?, ?, 'pilot_operator', 'site', ?, 'verified-env-pilot-operator', NULL)`,
      grantId,
      principalId,
      siteId
    ),
    q(
      `INSERT OR IGNORE INTO audit_receipts (receipt_id, actor_id, action, entity_ref, reason, created_at)
       VALUES (?, ?, 'BOOTSTRAP_PILOT_OPERATOR', ?, 'Verified project owner subject configured via YOURDREAM_PILOT_OPERATOR_SUBJECT_ID', ?)`,
      receiptId,
      principalId,
      `site:${siteId}:subject:${subject}`,
      now
    ),
  ]);
  return true;
}

function matchPracticeRoute(pathname) {
  if (pathname === '/api/practice/sessions') {
    return { route: 'SESSIONS_ROOT', params: {} };
  }
  if (pathname === '/api/me/progress') {
    return { route: 'ME_PROGRESS', params: {} };
  }
  const sessionEventsMatch = /^\/api\/practice\/sessions\/([^/]+)\/events$/.exec(pathname);
  if (sessionEventsMatch) {
    let sessionId;
    try {
      sessionId = decodeURIComponent(sessionEventsMatch[1]);
    } catch {
      throw new DomainError(400, 'INVALID_ID');
    }
    return { route: 'SESSION_EVENTS', params: { session_id: sessionId } };
  }
  const sessionMatch = /^\/api\/practice\/sessions\/([^/]+)$/.exec(pathname);
  if (sessionMatch) {
    let sessionId;
    try {
      sessionId = decodeURIComponent(sessionMatch[1]);
    } catch {
      throw new DomainError(400, 'INVALID_ID');
    }
    return { route: 'SESSION_ITEM', params: { session_id: sessionId } };
  }
  return null;
}

/**
 * Handles any of the 4 practice API endpoints with full HTTP boundary enforcement.
 */
async function handlePracticeApiRequest({
  request,
  db,
  user,
  siteId = DEFAULT_SITE_ID,
  rawContent = null,
  sha256 = DEFAULT_SHA256,
  engine = defaultEngine,
  pilotOperatorSubject = null,
  forbidSyntheticSubjects = true,
  logger = console,
}) {
  let matched = null;
  let extraHeaders = {};
  try {
    if (!db) {
      throw new Error('D1_BINDING_UNAVAILABLE');
    }

    const requestUrl = new URL(request.url);
    matched = matchPracticeRoute(requestUrl.pathname);
    if (!matched) {
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }

    const method = (request.method || 'GET').toUpperCase();
    if (matched.route === 'SESSIONS_ROOT' || matched.route === 'SESSION_EVENTS') {
      if (method !== 'POST') {
        return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'POST' });
      }
      verifySameOriginMutation(request, requestUrl);
    } else if (matched.route === 'SESSION_ITEM' || matched.route === 'ME_PROGRESS') {
      if (method !== 'GET') {
        return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET' });
      }
    }

    rejectUntrustedClientHeaders(request);

    // Authenticate strictly from trusted server helper output (`getChatGPTUser()`)
    const identity = resolveTrustedIdentity(user, {
      forbidSyntheticSubjects,
      siteId,
    });
    const accountScope = (await sha256Hex(`${siteId}:${identity.subject}`)).slice(0, 24);
    extraHeaders = { 'x-yd-account-scope': accountScope };

    // Validate query parameters and read bounded request body BEFORE any D1 access
    let parsedBody = null;
    let cursor = '';
    if (matched.route === 'SESSIONS_ROOT' || matched.route === 'SESSION_EVENTS') {
      if ([...requestUrl.searchParams.keys()].length > 0) {
        throw new DomainError(400, 'INVALID_QUERY');
      }
      parsedBody = await readBoundedJsonBody(request, MAX_BODY_BYTES);
    } else if (matched.route === 'SESSION_ITEM') {
      if ([...requestUrl.searchParams.keys()].length > 0) {
        throw new DomainError(400, 'INVALID_QUERY');
      }
    } else if (matched.route === 'ME_PROGRESS') {
      for (const key of requestUrl.searchParams.keys()) {
        if (key !== 'cursor') {
          throw new DomainError(400, 'INVALID_QUERY');
        }
      }
      cursor = requestUrl.searchParams.get('cursor') ?? '';
    }

    const contentString = rawContent ?? getDefaultRawContent();
    // Create a fresh per-request D1 session once per request
    const rawSessionDb =
      typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
    // Wrap so createService doesn't open a second nested session on the same request
    const sessionDb = {
      prepare: (...args) => rawSessionDb.prepare(...args),
      batch: (...args) => rawSessionDb.batch(...args),
    };

    if (pilotOperatorSubject) {
      await ensureVerifiedPilotOperatorAndDraftContent(sessionDb, {
        siteId,
        subject: identity.subject,
        pilotOperatorSubject,
        rawContent: contentString,
        sha256,
      });
    }

    const service = await createService(sessionDb, {
      rawContent: contentString,
      sha256,
      engine,
      siteId,
    });

    if (matched.route === 'SESSIONS_ROOT') {
      const receipt = await service.createSession(identity, parsedBody);
      return jsonResponse(receipt, 200, extraHeaders);
    }

    if (matched.route === 'SESSION_EVENTS') {
      const receipt = await service.submit(
        identity,
        matched.params.session_id,
        parsedBody
      );
      return jsonResponse(receipt, 200, extraHeaders);
    }

    if (matched.route === 'SESSION_ITEM') {
      const resumed = await service.resume(identity, matched.params.session_id);
      return jsonResponse(resumed, 200, extraHeaders);
    }

    if (matched.route === 'ME_PROGRESS') {
      const result = await service.progress(identity, cursor);
      return jsonResponse(result, 200, extraHeaders);
    }

    return jsonResponse({ error: 'NOT_FOUND' }, 404, extraHeaders);
  } catch (error) {
    if (
      error instanceof DomainError ||
      (error &&
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 500 &&
        typeof error.code === 'string')
    ) {
      return jsonResponse({ error: error.code }, error.status, extraHeaders);
    }
    // Log sanitized internal error without any request payload or learner answer data
    if (logger && typeof logger.error === 'function') {
      logger.error(
        JSON.stringify({
          event: 'PRACTICE_API_INTERNAL_ERROR',
          route: matched ? matched.route : 'UNKNOWN',
          name: error instanceof Error ? error.name : 'Error',
        })
      );
    }
    return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, extraHeaders);
  }
}

module.exports = {
  DEFAULT_SHA256,
  DEFAULT_SITE_ID,
  MAX_BODY_BYTES,
  SYNTHETIC_SUBJECTS,
  handlePracticeApiRequest,
  ensureVerifiedPilotOperatorAndDraftContent,
  resolveTrustedIdentity,
  verifySameOriginMutation,
  readBoundedJsonBody,
  sha256Hex,
};
