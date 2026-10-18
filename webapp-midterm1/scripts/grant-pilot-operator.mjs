#!/usr/bin/env node
/**
 * Separate Operator Role Provisioning Helper (EXAM-CORE-03)
 *
 * Generates SQL statements to register a verified project owner's platform
 * `subject_id` (from `getChatGPTUser().userId`) as `pilot_operator` in
 * `principals`, `learner_profiles`, `role_grants`, and `audit_receipts`,
 * strictly separated from schema migrations.
 *
 * Rejects synthetic test identities (A, B, S, T, P) and workspace/project IDs
 * (`appgprj_...`).
 */
import crypto from "node:crypto";

const SYNTHETIC = new Set(["A", "B", "S", "T", "P"]);
const DEFAULT_SITE_ID = "appgprj_6ad181ec04e4819184ffd9a4d45d518e";

export function buildPilotOperatorGrantSql(
  subjectId,
  siteId = DEFAULT_SITE_ID
) {
  if (typeof subjectId !== "string") {
    throw new Error("subject_id must be a non-empty string.");
  }
  const trimmed = subjectId.trim();
  if (!/^[A-Za-z0-9:._-]{1,100}$/.test(trimmed)) {
    throw new Error("subject_id must match /^[A-Za-z0-9:._-]{1,100}$/.");
  }
  if (SYNTHETIC.has(trimmed) || SYNTHETIC.has(trimmed.toUpperCase())) {
    throw new Error("Refusing to provision synthetic test identity in hosted D1.");
  }
  if (trimmed.startsWith("appgprj_") || trimmed === siteId) {
    throw new Error(
      "Refusing to assume workspace/project ID (appgprj_...) is the authenticated session subject_id."
    );
  }
  const digest = crypto
    .createHash("sha256")
    .update(`${siteId}:${trimmed}`)
    .digest("hex")
    .slice(0, 24);
  const principalId = `p_op_${digest}`;
  const learnerId = `l_op_${digest}`;
  const grantId = `g_op_${digest}`;
  const receiptId = `r_op_${digest}`;

  return [
    `INSERT OR IGNORE INTO principals (principal_id, site_id, site_subject_id, status, created_at) VALUES ('${principalId}', '${siteId}', '${trimmed}', 'ACTIVE', strftime('%Y-%m-%dT%H:%M:%SZ','now'));`,
    `INSERT OR IGNORE INTO learner_profiles (learner_id, principal_id, status) VALUES ('${learnerId}', '${principalId}', 'ACTIVE');`,
    `INSERT OR IGNORE INTO role_grants (grant_id, principal_id, role, scope_type, scope_id, granted_by, revoked_at) VALUES ('${grantId}', '${principalId}', 'pilot_operator', 'site', '${siteId}', 'explicit-operator-provisioning', NULL);`,
    `INSERT OR IGNORE INTO audit_receipts (receipt_id, actor_id, action, entity_ref, reason, created_at) VALUES ('${receiptId}', '${principalId}', 'PROVISION_PILOT_OPERATOR', 'site:${siteId}:subject:${trimmed}', 'Explicit verified project owner provisioning', strftime('%Y-%m-%dT%H:%M:%SZ','now'));`,
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const subjectId =
    process.argv[2] || process.env.YOURDREAM_PILOT_OPERATOR_SUBJECT_ID;
  if (!subjectId) {
    console.error(
      "Usage: node scripts/grant-pilot-operator.mjs <verified-subject-id>"
    );
    process.exit(1);
  }
  process.stdout.write(buildPilotOperatorGrantSql(subjectId) + "\n");
}
