-- YOURDREAM EXAM-CORE-03 — Separate Content Registration Script (NOT a schema migration)
-- Registers EXAM-RAD-01 v0.1.0-DRAFT strictly in DRAFT review_state for operator preview only.
-- Never promotes content to APPROVED and never creates student accounts (`A/B/S/T/P`).

INSERT INTO content_versions (
  content_key,
  package_id,
  version,
  sha256,
  review_state,
  manifest_ref,
  validator_version,
  withdrawn_at
) VALUES (
  'EXAM-RAD-01:0.1.0-DRAFT:a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2',
  'EXAM-RAD-01',
  '0.1.0-DRAFT',
  'a16d43b62b2b667422778ae140f610115625843319efefa513df65b2a4be25d2',
  'DRAFT',
  'data/radical-steps-v0.1.json',
  'radicals-engine:rad04',
  NULL
)
ON CONFLICT(content_key) DO UPDATE SET
  review_state = 'DRAFT',
  validator_version = excluded.validator_version;
