-- 202614291200_reconciler_exceptions.sql
-- 13d, the reconciler backend half (Lead ruling "ALL 13 FINISH BEFORE THE FEED",
-- docs/bus/09-23-2026-LEAD-RULING-CURSOR-ALL-13-E9-RECONCILER-CROSS.md). Claimed #22371.
--
-- The reconciler (apps/backend/src/reconciler) asserts the dispatch-to-cash chain as invariants.
-- Detection runs live on every GET /api/v1/reconciler/exceptions; this is the history the live read
-- cannot give: when a breach was first seen, whether it is still open, and when it resolved.
--
-- reconciler.exceptions — one row per breach, keyed by the reconciler's stable exception key
--   (invariant/entity_type/entity_id/field). Written only by the reconciler cron: an exception seen
--   again refreshes last_seen_at; one no longer found by an invariant that RAN resolves; one that comes
--   back reopens. Never deleted: SELECT, INSERT, UPDATE only.
-- reconciler.runs — one append-only row per cron run: when, how many open, which invariants errored.
--   An errored invariant never resolves its exceptions, and the run says so.
--
-- CREATE-only, idempotent, FORCE RLS, no hardcoded company id.

CREATE SCHEMA IF NOT EXISTS reconciler;
GRANT USAGE ON SCHEMA reconciler TO ih35_app;

CREATE TABLE IF NOT EXISTS reconciler.exceptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  exception_key         text        NOT NULL,
  invariant             text        NOT NULL,
  entity_type           text        NOT NULL,
  entity_id             uuid        NOT NULL,
  entity_label          text        NOT NULL,
  field                 text        NOT NULL,
  reason                text        NOT NULL,
  since                 timestamptz NOT NULL,
  since_source          text        NOT NULL,
  owner_seat            text        NOT NULL,
  repair_engine         text,
  amount_cents          bigint,
  amount_source         text,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  times_reopened        integer     NOT NULL DEFAULT 0,
  CONSTRAINT reconciler_exceptions_company_key UNIQUE (operating_company_id, exception_key),
  CONSTRAINT reconciler_exceptions_entity_type_check
    CHECK (entity_type IN ('load', 'recovery_link', 'invoice_dispute')),
  CONSTRAINT reconciler_exceptions_seen_order
    CHECK (last_seen_at >= first_seen_at AND (resolved_at IS NULL OR resolved_at >= first_seen_at)),
  CONSTRAINT reconciler_exceptions_reason_present CHECK (btrim(reason) <> ''),
  CONSTRAINT reconciler_exceptions_reopened_nonneg CHECK (times_reopened >= 0)
);

CREATE INDEX IF NOT EXISTS reconciler_exceptions_open_idx
  ON reconciler.exceptions (operating_company_id, invariant)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS reconciler.runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  ran_at                timestamptz NOT NULL DEFAULT now(),
  open_count            integer     NOT NULL,
  opened_count          integer     NOT NULL,
  resolved_count        integer     NOT NULL,
  errored_invariants    text[]      NOT NULL DEFAULT '{}',
  CONSTRAINT reconciler_runs_counts_nonneg CHECK (open_count >= 0 AND opened_count >= 0 AND resolved_count >= 0)
);

CREATE INDEX IF NOT EXISTS reconciler_runs_company_ran_idx
  ON reconciler.runs (operating_company_id, ran_at DESC);

ALTER TABLE reconciler.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciler.exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciler.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciler.runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciler_exceptions_company_isolation ON reconciler.exceptions;
CREATE POLICY reconciler_exceptions_company_isolation
  ON reconciler.exceptions
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS reconciler_runs_company_isolation ON reconciler.runs;
CREATE POLICY reconciler_runs_company_isolation
  ON reconciler.runs
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON reconciler.exceptions TO ih35_app;
REVOKE DELETE, TRUNCATE ON reconciler.exceptions FROM ih35_app;
GRANT SELECT, INSERT ON reconciler.runs TO ih35_app;
REVOKE UPDATE, DELETE, TRUNCATE ON reconciler.runs FROM ih35_app;
