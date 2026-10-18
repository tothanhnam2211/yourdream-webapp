PRAGMA foreign_keys = ON;
CREATE TABLE principals (
 principal_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, site_subject_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','DISABLED')), created_at TEXT NOT NULL,
 UNIQUE(site_id,site_subject_id)
);
CREATE TABLE role_grants (
 grant_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL REFERENCES principals(principal_id),
 role TEXT NOT NULL CHECK(role IN ('student','pilot_operator','teacher','parent','operator')),
 scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, granted_by TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE learner_profiles (
 learner_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL UNIQUE REFERENCES principals(principal_id),
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','DISABLED'))
);
CREATE TABLE content_versions (
 content_key TEXT PRIMARY KEY, package_id TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT NOT NULL,
 review_state TEXT NOT NULL CHECK(review_state IN ('DRAFT','APPROVED')), manifest_ref TEXT NOT NULL,
 validator_version TEXT NOT NULL, withdrawn_at TEXT, UNIQUE(package_id,version,sha256)
);
CREATE TABLE practice_sessions (
 session_id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learner_profiles(learner_id),
 content_key TEXT NOT NULL REFERENCES content_versions(content_key), item_id TEXT NOT NULL,
 cycle_id INTEGER NOT NULL CHECK(cycle_id>=0), revision INTEGER NOT NULL CHECK(revision>=0),
 state_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','CLOSED')), created_at TEXT NOT NULL
);
CREATE TABLE practice_events (
 server_event_id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES learner_profiles(learner_id),
 session_id TEXT NOT NULL REFERENCES practice_sessions(session_id), client_event_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, server_sequence INTEGER NOT NULL CHECK(server_sequence>=0),
 event_type TEXT NOT NULL, step_id TEXT, cycle_id INTEGER NOT NULL,
 answer_json TEXT, server_result TEXT, support_snapshot TEXT NOT NULL,
 checker_version TEXT NOT NULL, received_at TEXT NOT NULL, receipt_json TEXT NOT NULL,
 UNIQUE(learner_id,client_event_id), UNIQUE(session_id,server_sequence)
);
CREATE TABLE step_progress (
 session_id TEXT NOT NULL REFERENCES practice_sessions(session_id), step_id TEXT NOT NULL,
 latest_attempt_id TEXT, status TEXT NOT NULL, support_state TEXT NOT NULL,
 projection_version TEXT NOT NULL, PRIMARY KEY(session_id,step_id)
);
CREATE TABLE audit_receipts (
 receipt_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 entity_ref TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX sessions_owner ON practice_sessions(learner_id,session_id);
CREATE INDEX grants_principal ON role_grants(principal_id,role,scope_type,scope_id);
