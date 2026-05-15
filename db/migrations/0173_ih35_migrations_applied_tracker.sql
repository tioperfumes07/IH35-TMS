-- Block L — canonical migration filename ledger for drift detection + tooling.

BEGIN;

CREATE SCHEMA IF NOT EXISTS ih35_migrations;

CREATE TABLE IF NOT EXISTS ih35_migrations.applied_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ih35_migrations.applied_migrations (name)
SELECT filename
FROM _system._schema_migrations
ON CONFLICT (name) DO NOTHING;

COMMIT;
