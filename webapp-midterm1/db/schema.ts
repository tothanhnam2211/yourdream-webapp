import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const principals = sqliteTable(
  "principals",
  {
    principal_id: text("principal_id").primaryKey(),
    site_id: text("site_id").notNull(),
    site_subject_id: text("site_subject_id").notNull(),
    status: text("status").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    unique("principals_site_id_site_subject_id_unique").on(
      t.site_id,
      t.site_subject_id,
    ),
    check(
      "principals_status_check",
      sql`${t.status} IN ('ACTIVE','DISABLED')`,
    ),
  ],
);

export const roleGrants = sqliteTable(
  "role_grants",
  {
    grant_id: text("grant_id").primaryKey(),
    principal_id: text("principal_id")
      .notNull()
      .references(() => principals.principal_id),
    role: text("role").notNull(),
    scope_type: text("scope_type").notNull(),
    scope_id: text("scope_id").notNull(),
    granted_by: text("granted_by").notNull(),
    revoked_at: text("revoked_at"),
  },
  (t) => [
    index("grants_principal").on(
      t.principal_id,
      t.role,
      t.scope_type,
      t.scope_id,
    ),
    check(
      "role_grants_role_check",
      sql`${t.role} IN ('student','pilot_operator','teacher','parent','operator')`,
    ),
  ],
);

export const learnerProfiles = sqliteTable(
  "learner_profiles",
  {
    learner_id: text("learner_id").primaryKey(),
    principal_id: text("principal_id")
      .notNull()
      .unique()
      .references(() => principals.principal_id),
    status: text("status").notNull(),
  },
  (t) => [
    check(
      "learner_profiles_status_check",
      sql`${t.status} IN ('ACTIVE','DISABLED')`,
    ),
  ],
);

export const contentVersions = sqliteTable(
  "content_versions",
  {
    content_key: text("content_key").primaryKey(),
    package_id: text("package_id").notNull(),
    version: text("version").notNull(),
    sha256: text("sha256").notNull(),
    review_state: text("review_state").notNull(),
    manifest_ref: text("manifest_ref").notNull(),
    validator_version: text("validator_version").notNull(),
    withdrawn_at: text("withdrawn_at"),
  },
  (t) => [
    unique("content_versions_pkg_ver_sha_unique").on(
      t.package_id,
      t.version,
      t.sha256,
    ),
    check(
      "content_versions_review_state_check",
      sql`${t.review_state} IN ('DRAFT','APPROVED')`,
    ),
  ],
);

export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    session_id: text("session_id").primaryKey(),
    learner_id: text("learner_id")
      .notNull()
      .references(() => learnerProfiles.learner_id),
    content_key: text("content_key")
      .notNull()
      .references(() => contentVersions.content_key),
    item_id: text("item_id").notNull(),
    cycle_id: integer("cycle_id").notNull(),
    revision: integer("revision").notNull(),
    state_json: text("state_json").notNull(),
    status: text("status").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    index("sessions_owner").on(t.learner_id, t.session_id),
    check("practice_sessions_cycle_id_check", sql`${t.cycle_id} >= 0`),
    check("practice_sessions_revision_check", sql`${t.revision} >= 0`),
    check(
      "practice_sessions_status_check",
      sql`${t.status} IN ('ACTIVE','CLOSED')`,
    ),
  ],
);

export const practiceEvents = sqliteTable(
  "practice_events",
  {
    server_event_id: text("server_event_id").primaryKey(),
    learner_id: text("learner_id")
      .notNull()
      .references(() => learnerProfiles.learner_id),
    session_id: text("session_id")
      .notNull()
      .references(() => practiceSessions.session_id),
    client_event_id: text("client_event_id").notNull(),
    request_hash: text("request_hash").notNull(),
    server_sequence: integer("server_sequence").notNull(),
    event_type: text("event_type").notNull(),
    step_id: text("step_id"),
    cycle_id: integer("cycle_id").notNull(),
    answer_json: text("answer_json"),
    server_result: text("server_result"),
    support_snapshot: text("support_snapshot").notNull(),
    checker_version: text("checker_version").notNull(),
    received_at: text("received_at").notNull(),
    receipt_json: text("receipt_json").notNull(),
  },
  (t) => [
    unique("practice_events_learner_client_event_unique").on(
      t.learner_id,
      t.client_event_id,
    ),
    unique("practice_events_session_seq_unique").on(
      t.session_id,
      t.server_sequence,
    ),
    check(
      "practice_events_server_sequence_check",
      sql`${t.server_sequence} >= 0`,
    ),
  ],
);

export const stepProgress = sqliteTable(
  "step_progress",
  {
    session_id: text("session_id")
      .notNull()
      .references(() => practiceSessions.session_id),
    step_id: text("step_id").notNull(),
    latest_attempt_id: text("latest_attempt_id"),
    status: text("status").notNull(),
    support_state: text("support_state").notNull(),
    projection_version: text("projection_version").notNull(),
  },
  (t) => [primaryKey({ columns: [t.session_id, t.step_id] })],
);

export const auditReceipts = sqliteTable("audit_receipts", {
  receipt_id: text("receipt_id").primaryKey(),
  actor_id: text("actor_id").notNull(),
  action: text("action").notNull(),
  entity_ref: text("entity_ref").notNull(),
  reason: text("reason").notNull(),
  created_at: text("created_at").notNull(),
});
