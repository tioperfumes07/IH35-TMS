-- ── C2-FACTORING-PROFILE ──────────────────────────────────────────────────────
-- Additive enrichment of factoring.factor (already exists via 0289).
--
-- NEW columns:
--   remittance_details jsonb     — wire/ACH remittance info
--   fee_schedule jsonb           — ordered tiered fee rates by invoice age
--                                  [{from_day, to_day, fee_rate}]
--                                  to_day null = "and beyond"
--                                  falls back to flat fee_rate when absent
--   reserve_schedule jsonb       — ordered tiered reserve rates by invoice age
--                                  [{from_day, to_day, reserve_rate}]
--                                  falls back to flat reserve_rate when absent
--   fee_application_mode text    — 'replace' | 'segmented' | 'additive'
--   notes text                   — free-text
--   updated_at trigger           — auto-stamp on UPDATE
--   NULLIF RLS policy v2         — for ih35_app role
--   factor_profile_id FK         — on accounting.invoices → factoring.factor
--
-- Flat columns (advance_rate, fee_rate, reserve_rate, recourse_days) are NOT
-- dropped — they remain as tier-0 / default fallback values.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Additive columns on factoring.factor ───────────────────────────────────
ALTER TABLE factoring.factor
  ADD COLUMN IF NOT EXISTS remittance_details   jsonb,
  ADD COLUMN IF NOT EXISTS fee_schedule         jsonb,
  ADD COLUMN IF NOT EXISTS reserve_schedule     jsonb,
  ADD COLUMN IF NOT EXISTS fee_application_mode text NOT NULL DEFAULT 'replace'
    CHECK (fee_application_mode IN ('replace', 'segmented', 'additive')),
  ADD COLUMN IF NOT EXISTS notes                text;

COMMENT ON COLUMN factoring.factor.fee_schedule IS
  'Ordered fee tiers by invoice age. Each element: {from_day int, to_day int|null, fee_rate numeric 0-1}.
   to_day null = open-ended. Tiers must be contiguous, start at from_day=0, no gaps/overlaps.
   Falls back to flat fee_rate column when NULL.';

COMMENT ON COLUMN factoring.factor.reserve_schedule IS
  'Ordered reserve tiers by invoice age. Each element: {from_day int, to_day int|null, reserve_rate numeric 0-1}.
   Same contiguity rules as fee_schedule. Falls back to flat reserve_rate when NULL.';

COMMENT ON COLUMN factoring.factor.fee_application_mode IS
  'How fee tiers are applied to an invoice.
   replace   = tier rate covering current age applies to full invoice amount from day 0.
                Example: $10,000 invoice aged 35 days; tiers [0-30 @ 1.5%, 30+ @ 2.5%]
                → fee = $10,000 × 0.025 = $250.00
   segmented = each tier rate applies pro-rata to only the days spent in that window.
                Example: same invoice aged 35 days
                → fee = ($10,000 × 0.015 × 30/35) + ($10,000 × 0.025 × 5/35) = $128.57 + $35.71 = $164.29
   additive  = when a threshold is crossed, that tier rate is added on top cumulatively.
                Example: $10,000 invoice aged 35 days; tiers [0-30 @ 1.5%, 30+ adds 0.5%]
                → fee = $10,000 × 0.015 + $10,000 × 0.005 = $150.00 + $50.00 = $200.00
   Default: replace (most common in US spot-factoring agreements).';

-- ── 2. updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION factoring.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_factor_updated_at'
      AND tgrelid = 'factoring.factor'::regclass
  ) THEN
    CREATE TRIGGER trg_factor_updated_at
      BEFORE UPDATE ON factoring.factor
      FOR EACH ROW EXECUTE FUNCTION factoring.set_updated_at();
  END IF;
END $$;

-- ── 3. NULLIF RLS policy v2 (for ih35_app role) ───────────────────────────────
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

-- ── 4. factor_profile_id FK on accounting.invoices ──────────────────────────
--    Links an invoice to the factoring profile it was submitted under.
--    Nullable — not all invoices are factored. No cascade delete.
ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS factor_profile_id uuid
    REFERENCES factoring.factor(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_factor_profile
  ON accounting.invoices (factor_profile_id)
  WHERE factor_profile_id IS NOT NULL;
