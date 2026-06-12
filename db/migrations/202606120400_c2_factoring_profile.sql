-- ── C2-FACTORING-PROFILE ──────────────────────────────────────────────────────
-- Additive enrichment of factoring.factor (already exists via 0289).
-- Adds: remittance_details, fee_schedule, notes, updated_at trigger,
--       NULLIF-based RLS fix, factor_id link on accounting.invoices.
-- No hard deletes. No money-moving actions. Audit via spine on mutations.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Additive columns on factoring.factor ──────────────────────────────────
ALTER TABLE factoring.factor
  ADD COLUMN IF NOT EXISTS remittance_details jsonb,
  ADD COLUMN IF NOT EXISTS fee_schedule        jsonb,
  ADD COLUMN IF NOT EXISTS notes               text;

-- ── 2. updated_at trigger function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION factoring.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_factor_updated_at'
  ) THEN
    CREATE TRIGGER trg_factor_updated_at
      BEFORE UPDATE ON factoring.factor
      FOR EACH ROW EXECUTE FUNCTION factoring.set_updated_at();
  END IF;
END $$;

-- ── 3. RLS: replace tenant_id = text comparison with NULLIF pattern ────────────
--    (existing policy uses identity.is_lucia_bypass() OR tenant_id::text = current_setting(…))
--    We add a parallel policy name with NULLIF for ih35_app if not already correct.
--    Safe to run multiple times via DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS factoring_factor_tenant_scope_v2 ON factoring.factor;
CREATE POLICY factoring_factor_tenant_scope_v2
  ON factoring.factor
  FOR ALL TO ih35_app
  USING (
    tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS factoring_customer_factor_assignment_tenant_scope_v2
  ON factoring.customer_factor_assignment;
CREATE POLICY factoring_customer_factor_assignment_tenant_scope_v2
  ON factoring.customer_factor_assignment
  FOR ALL TO ih35_app
  USING (
    tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

-- ── 4. factor_id link on accounting.invoices ────────────────────────────────
--    Links an invoice directly to the factoring.factor profile it was submitted under.
--    Nullable — not all invoices are factored. No cascade delete.
ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS factor_profile_id uuid
    REFERENCES factoring.factor(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_factor_profile
  ON accounting.invoices (factor_profile_id)
  WHERE factor_profile_id IS NOT NULL;
