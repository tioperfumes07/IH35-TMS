-- FINDING: LV-REPORTS-FUEL-PRICE-VARIANCE-PHANTOM-BENCHMARK-TABLE (Codex Live + Neon 2026-08-16) —
-- `/reports/run/fuel-price-variance` fails after a Run Report because
-- apps/backend/src/reports/fuel-price-variance.routes.ts:11-73 unconditionally queries
-- fuel.loves_prices_daily, but prod `to_regclass('fuel.loves_prices_daily')` is NULL (re-confirmed live
-- via Neon before writing this migration) and no migration ever created it.
--
-- Two writers already exist and already reference this exact table+column shape defensively (both guard
-- with `to_regclass('fuel.loves_prices_daily') IS NOT NULL` and degrade to an honest
-- `loves_prices_daily_unavailable` response/throw when it is absent — apps/backend/src/fuel/loves-upload
-- .routes.ts:80-224 for the manual XLSX upload path, apps/backend/src/sync/loves-card-import.ts:180-270
-- for the scheduled CSV import job). This migration builds the table those writers were already written
-- against — column-for-column verified against both writers' actual INSERT/UPDATE statements before this
-- file was written (session lesson from ACCT-F5408: never infer a column list from a stale view or from
-- memory — read every live writer first). No writer or route code changes; both are additive-safe already
-- because of their existing to_regclass guards.
--
-- Column shape verified against both writers:
--   operating_company_id, effective_date, station_uuid, station_name, station_address, city, state,
--   price_per_gallon, source_file_name, uploaded_by_user_id, updated_at (touched on every UPDATE).
-- Uniqueness contract: both writers manually UPDATE-then-INSERT keyed on
-- (operating_company_id, effective_date, station_name, station_address) — this migration adds a real
-- unique index on that exact key, which only adds a race-safety net (the writers' `.catch(() => ({
-- rowCount: 0 }))` already treats a duplicate-key INSERT failure as `rows_skipped`, so this is
-- non-breaking for existing writer behavior).
--
-- RLS + grants copied verbatim from the sibling fuel.fuel_transactions table (same schema, same
-- company-isolation shape, forced RLS). ih35_app must get SELECT/INSERT/UPDATE only — no DELETE, this
-- is daily-overwritten reference/benchmark data, not a financial ledger, so void-not-delete columns are
-- not applicable, but DELETE is still withheld from the runtime role as a floor.
--
-- DELETE is REVOKEd EXPLICITLY below, not just omitted from the GRANT line. GRANT is additive-only — it
-- never removes a privilege a schema's DEFAULT PRIVILEGES already granted. Migration
-- 0065_p3_cleanup_3_permanent_grants.sql sets `ALTER DEFAULT PRIVILEGES IN SCHEMA fuel GRANT SELECT,
-- INSERT, UPDATE, DELETE ON TABLES TO ih35_app` (no `FOR ROLE` clause, so it applies to future tables
-- created by whichever role ran 0065, not necessarily whichever role runs this migration) — omitting
-- DELETE from this migration's own GRANT line does NOT prove ih35_app lacks it. This is the exact,
-- already-proven mistake documented in scripts/verify-safety-evidence-no-delete-grant.mjs (found by the
-- owner on `safety` schema tables, 2026-07-24: "GRANT SELECT, INSERT, UPDATE" shipped DELETE-able on
-- prod because a local throwaway DB's default privileges didn't match prod's). The explicit REVOKE below
-- makes the floor unconditional regardless of which role applies this migration or what any schema
-- default grants.
--
-- Additive/idempotent (CREATE TABLE IF NOT EXISTS). No existing data touched. No GL/posting math — this
-- is a fuel-price reference table consumed only by the read-only variance report.

BEGIN;

CREATE TABLE IF NOT EXISTS fuel.loves_prices_daily (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  effective_date       date NOT NULL DEFAULT current_date,
  station_uuid         text NULL,
  station_name         text NOT NULL,
  station_address      text NOT NULL,
  city                 text NULL,
  state                text NULL,
  price_per_gallon     numeric NOT NULL,
  source_file_name     text NULL,
  uploaded_by_user_id  uuid NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- Neither writer validates positivity (only Number.isFinite) — a bad spreadsheet row (0, negative,
  -- or a cents/dollars unit slip) would otherwise silently shift the state-average benchmark that
  -- total_variance_dollars is computed from.
  CONSTRAINT loves_prices_daily_price_positive CHECK (price_per_gallon > 0)
);

-- Matches both writers' manual upsert key exactly (operating_company_id, effective_date, station_name,
-- station_address) — see header. Race-safety net only; writer logic is unchanged by this index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loves_prices_daily_station_day
  ON fuel.loves_prices_daily (operating_company_id, effective_date, station_name, station_address);

-- Report query groups by (effective_date, state) per operating_company_id — see
-- fuel-price-variance.routes.ts's daily_state_benchmark CTE.
CREATE INDEX IF NOT EXISTS ix_loves_prices_daily_company_date_state
  ON fuel.loves_prices_daily (operating_company_id, effective_date, state);

CREATE OR REPLACE FUNCTION fuel.touch_loves_prices_daily_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_loves_prices_daily_updated_at ON fuel.loves_prices_daily;
CREATE TRIGGER trg_touch_loves_prices_daily_updated_at
  BEFORE UPDATE ON fuel.loves_prices_daily
  FOR EACH ROW EXECUTE FUNCTION fuel.touch_loves_prices_daily_updated_at();

-- FORCED RLS + entity-scoped policy (0065 pattern, matches fuel.fuel_transactions verbatim).
ALTER TABLE fuel.loves_prices_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.loves_prices_daily FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loves_prices_daily_company_isolation ON fuel.loves_prices_daily;
CREATE POLICY loves_prices_daily_company_isolation ON fuel.loves_prices_daily
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- Runtime grants (no DELETE — matches fuel.fuel_transactions; daily rows are overwritten via UPDATE, not
-- removed).
GRANT SELECT, INSERT, UPDATE ON fuel.loves_prices_daily TO ih35_app;

-- Explicit floor: REVOKE, not just omit. See the header note above — GRANT is additive-only and cannot
-- be trusted to prove absence of a schema-default-granted privilege. This makes the no-DELETE contract
-- true regardless of which role applies this migration.
REVOKE DELETE ON fuel.loves_prices_daily FROM ih35_app;
REVOKE DELETE ON fuel.loves_prices_daily FROM PUBLIC;

-- Append-only WORM audit trail (same trigger pattern used across the fuel/accounting schemas).
DROP TRIGGER IF EXISTS tg_audit_row_loves_prices_daily ON fuel.loves_prices_daily;
CREATE TRIGGER tg_audit_row_loves_prices_daily
  AFTER INSERT OR UPDATE OR DELETE ON fuel.loves_prices_daily
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

COMMIT;

-- NOTE: no trailing evidence SELECT here. This table is FORCE ROW LEVEL SECURITY with a single
-- policy scoped `TO ih35_app` — a role without BYPASSRLS (whichever role actually applies this
-- migration) would correctly see 0 rows regardless of real data, and a role WITH BYPASSRLS would see
-- true data but that says nothing about the runtime app's own visibility. Either way a bare
-- `SELECT count(*)` here would be misleading evidence, not proof — to_regclass(...) IS NOT NULL
-- (checked live in both writers and the report route) is the correct existence check for this table.
