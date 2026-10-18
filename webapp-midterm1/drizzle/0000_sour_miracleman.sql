CREATE TABLE `audit_receipts` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_ref` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_versions` (
	`content_key` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version` text NOT NULL,
	`sha256` text NOT NULL,
	`review_state` text NOT NULL,
	`manifest_ref` text NOT NULL,
	`validator_version` text NOT NULL,
	`withdrawn_at` text,
	CONSTRAINT "content_versions_review_state_check" CHECK("content_versions"."review_state" IN ('DRAFT','APPROVED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_versions_pkg_ver_sha_unique` ON `content_versions` (`package_id`,`version`,`sha256`);--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`learner_id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`principal_id`) REFERENCES `principals`(`principal_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learner_profiles_status_check" CHECK("learner_profiles"."status" IN ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learner_profiles_principal_id_unique` ON `learner_profiles` (`principal_id`);--> statement-breakpoint
CREATE TABLE `practice_events` (
	`server_event_id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`client_event_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`server_sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`step_id` text,
	`cycle_id` integer NOT NULL,
	`answer_json` text,
	`server_result` text,
	`support_snapshot` text NOT NULL,
	`checker_version` text NOT NULL,
	`received_at` text NOT NULL,
	`receipt_json` text NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`learner_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`session_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "practice_events_server_sequence_check" CHECK("practice_events"."server_sequence" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_events_learner_client_event_unique` ON `practice_events` (`learner_id`,`client_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `practice_events_session_seq_unique` ON `practice_events` (`session_id`,`server_sequence`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`content_key` text NOT NULL,
	`item_id` text NOT NULL,
	`cycle_id` integer NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`learner_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_key`) REFERENCES `content_versions`(`content_key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "practice_sessions_cycle_id_check" CHECK("practice_sessions"."cycle_id" >= 0),
	CONSTRAINT "practice_sessions_revision_check" CHECK("practice_sessions"."revision" >= 0),
	CONSTRAINT "practice_sessions_status_check" CHECK("practice_sessions"."status" IN ('ACTIVE','CLOSED'))
);
--> statement-breakpoint
CREATE INDEX `sessions_owner` ON `practice_sessions` (`learner_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `principals` (
	`principal_id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`site_subject_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "principals_status_check" CHECK("principals"."status" IN ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `principals_site_id_site_subject_id_unique` ON `principals` (`site_id`,`site_subject_id`);--> statement-breakpoint
CREATE TABLE `role_grants` (
	`grant_id` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`role` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`granted_by` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`principal_id`) REFERENCES `principals`(`principal_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "role_grants_role_check" CHECK("role_grants"."role" IN ('student','pilot_operator','teacher','parent','operator'))
);
--> statement-breakpoint
CREATE INDEX `grants_principal` ON `role_grants` (`principal_id`,`role`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `step_progress` (
	`session_id` text NOT NULL,
	`step_id` text NOT NULL,
	`latest_attempt_id` text,
	`status` text NOT NULL,
	`support_state` text NOT NULL,
	`projection_version` text NOT NULL,
	PRIMARY KEY(`session_id`, `step_id`),
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
