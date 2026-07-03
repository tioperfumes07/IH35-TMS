-- RECON-01 — QBO↔TMS reconciliation data model (accounting.recon_runs + accounting.recon_exceptions).
-- FINANCIAL / Tier-2 gated. BUILD-AND-HOLD — never self-merge (§1.4): show full SQL + --staged --stat,
-- WAIT for "OK to merge", flag stays OFF at merge. Read-only reconciliation module (NO GL posting, NO
-- money movement): the engine writes ONLY these recon_* tables and flags divergences for a human. Authored
-- from docs/specs/TMS-QBO-RECONCILIATION.md §3–§4 + the ih35-financial-migrations skill. Idempotent,
-- CREATE-only, entity-scoped FORCED RLS, void-not-delete, self-contained grants. Money-free.

BEGIN;

-- ── Feature flag (DEFAULT OFF — turns on the read-only reconciliation passes; no posting either way) ──
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'TMS_QBO_RECON_ENABLED',
  'RECON-01: enable the read-only twice-daily QBO↔TMS reconciliation passes (AM bank count/sum, PM '
  || 'categorization divergence) that write accounting.recon_runs/recon_exceptions for human review. '
  || 'NEVER auto-fixes. DEFAULT OFF — per-entity owner-gated.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- ── recon_runs — one row per reconciliation pass ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting.recon_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  run_type              text NOT NULL CHECK (run_type IN
                          ('am_bank_count','pm_categorization_diff','on_demand_bank_count','on_demand_categorization_diff')),
  window_start          timestamptz,
  window_end            timestamptz,
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  preparer              uuid,                       -- user or scheduled-job identity that ran the pass
  reviewer              uuid,
  signed_off_at         timestamptz,
  totals                jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                text NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','complete','open','late')),
  voided_at             timestamptz,                -- void-not-delete
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recon_runs_opco_started_idx
  ON accounting.recon_runs (operating_company_id, started_at DESC)
  WHERE is_active;

-- ── recon_exceptions — one row per divergence found in a run ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting.recon_exceptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES accounting.recon_runs(id),
  operating_company_id  uuid NOT NULL,              -- denormalized from the run for direct RLS scoping
  exception_class       text NOT NULL CHECK (exception_class IN
                          ('COUNT_MISMATCH','SUM_MISMATCH','CATEGORIZATION_DIVERGENCE','ANCHOR_DRIFT',
                           'MODIFIED_AFTER_VERIFIED','REFERENCE_INTEGRITY','CLOSED_PERIOD_TOUCH','TOLERANCE_ACCEPTED')),
  source_ref            jsonb NOT NULL,             -- TMS-side {kind,id,display}
  qbo_ref               jsonb,                      -- QBO-side matched entry
  field                 text NOT NULL,              -- account_mapping | count | sum_cents | reference | ...
  tms_value             text,                       -- cents as integer-string where numeric (never float)
  qbo_value             text,
  severity              text NOT NULL DEFAULT 'medium'
                          CHECK (severity IN ('low','medium','high','elevated')),
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','explained','resolved')),
  resolved_by           uuid,                       -- maker≠checker enforced in the service + CI guard
  resolution_note       text,
  resolved_at           timestamptz,
  voided_at             timestamptz,                -- void-not-delete
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- no silent resolves: a resolved exception must carry a written reason.
  CONSTRAINT recon_exceptions_resolution_note_required
    CHECK (status <> 'resolved' OR resolution_note IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS recon_exceptions_run_idx
  ON accounting.recon_exceptions (run_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS recon_exceptions_opco_status_idx
  ON accounting.recon_exceptions (operating_company_id, status)
  WHERE is_active;

-- ── Entity-scoped FORCED RLS (canonical predicate) on both tables ───────────────────────────────────
ALTER TABLE accounting.recon_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.recon_runs        FORCE  ROW LEVEL SECURITY;
ALTER TABLE accounting.recon_exceptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.recon_exceptions  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_runs_entity_all       ON accounting.recon_runs;
DROP POLICY IF EXISTS recon_exceptions_entity_all  ON accounting.recon_exceptions;
CREATE POLICY recon_runs_entity_all ON accounting.recon_runs FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY recon_exceptions_entity_all ON accounting.recon_exceptions FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── Grants: SELECT/INSERT/UPDATE only — NO DELETE (void-not-delete). accounting.* default privileges may
--    auto-grant DELETE, so REVOKE it explicitly (verified via role_table_grants). REVOKE trips the
--    hold-merge-gate → correct: this is a HOLD migration. ─────────────────────────────────────────────
GRANT  USAGE ON SCHEMA accounting TO ih35_app;
GRANT  SELECT, INSERT, UPDATE ON accounting.recon_runs, accounting.recon_exceptions TO ih35_app;
REVOKE DELETE ON accounting.recon_runs, accounting.recon_exceptions FROM ih35_app;

COMMIT;
