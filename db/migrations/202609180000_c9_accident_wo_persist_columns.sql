-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
--
-- C9 — accident report + work order fields the UI already renders but had nowhere to land.
-- Additive only. No GL math. No QBO write-back. Idempotent.

BEGIN;

-- ── safety.accident_reports header facts ──────────────────────────────────────
ALTER TABLE safety.accident_reports
  ADD COLUMN IF NOT EXISTS record_type text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS report_date date,
  ADD COLUMN IF NOT EXISTS tax_rate_pct numeric(8,4);

DO $c9_accident_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'safety.accident_reports'::regclass
      AND conname = 'accident_reports_record_type_check'
  ) THEN
    ALTER TABLE safety.accident_reports
      ADD CONSTRAINT accident_reports_record_type_check
      CHECK (record_type IS NULL OR record_type IN ('accident', 'damage', 'vandalism'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'safety.accident_reports'::regclass
      AND conname = 'accident_reports_service_type_check'
  ) THEN
    ALTER TABLE safety.accident_reports
      ADD CONSTRAINT accident_reports_service_type_check
      CHECK (service_type IS NULL OR service_type IN ('repair', 'replacement', 'tow'));
  END IF;
END
$c9_accident_checks$;

COMMENT ON COLUMN safety.accident_reports.record_type IS
  'C9: Accident / Damage / Vandalism chosen on the office AccidentReportDrawer.';
COMMENT ON COLUMN safety.accident_reports.service_type IS
  'C9: Repair / Replacement / Tow chosen on the office AccidentReportDrawer.';
COMMENT ON COLUMN safety.accident_reports.report_date IS
  'C9: Calendar date the report was filed (distinct from accident_at incident timestamp).';
COMMENT ON COLUMN safety.accident_reports.tax_rate_pct IS
  'C9: Estimator tax % on the accident cost grid (not a posted GL amount by itself).';

-- ── safety.accident_cost_lines (estimator lines; WO spawn remains the ledger path) ─
CREATE TABLE IF NOT EXISTS safety.accident_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  accident_id uuid NOT NULL REFERENCES safety.accident_reports(id),
  section text NOT NULL CHECK (section IN ('A', 'B')),
  description text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accident_cost_lines_accident
  ON safety.accident_cost_lines (accident_id, sort_order);

DO $c9_accident_cost_rls$
BEGIN
  IF to_regclass('safety.accident_cost_lines') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE safety.accident_cost_lines ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE safety.accident_cost_lines FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'accident_cost_lines'
      AND policyname = 'accident_cost_lines_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY accident_cost_lines_tenant ON safety.accident_cost_lines
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON safety.accident_cost_lines TO ih35_app';
  EXECUTE 'REVOKE DELETE ON safety.accident_cost_lines FROM ih35_app';
END
$c9_accident_cost_rls$;

-- ── maintenance.work_orders customer + tax ────────────────────────────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS tax_rate_pct numeric(8,4);

DO $c9_wo_customer_fk$
BEGIN
  IF to_regclass('mdata.customers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'maintenance.work_orders'::regclass
         AND conname = 'work_orders_customer_id_fkey'
     ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES mdata.customers(id)
      ON DELETE SET NULL;
  END IF;
END
$c9_wo_customer_fk$;

CREATE INDEX IF NOT EXISTS idx_work_orders_customer_id
  ON maintenance.work_orders (customer_id)
  WHERE customer_id IS NOT NULL;

COMMENT ON COLUMN maintenance.work_orders.customer_id IS
  'C9: Bill-to customer linked at WO create (optional).';
COMMENT ON COLUMN maintenance.work_orders.tax_rate_pct IS
  'C9: Tax % used on the create-WO totals stack (vendor bill remains the posted tax source of truth).';

COMMIT;
