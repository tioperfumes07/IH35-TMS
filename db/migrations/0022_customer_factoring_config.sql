BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS factoring_eligible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS factoring_company_vendor_id UUID REFERENCES mdata.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS factoring_advance_rate_override NUMERIC(5,2)
    CHECK (factoring_advance_rate_override IS NULL OR (factoring_advance_rate_override >= 0 AND factoring_advance_rate_override <= 100)),
  ADD COLUMN IF NOT EXISTS factoring_reserve_pct_override NUMERIC(5,2)
    CHECK (factoring_reserve_pct_override IS NULL OR (factoring_reserve_pct_override >= 0 AND factoring_reserve_pct_override <= 100)),
  ADD COLUMN IF NOT EXISTS factoring_recourse_type TEXT
    CHECK (factoring_recourse_type IS NULL OR factoring_recourse_type IN ('recourse', 'non_recourse')),
  ADD COLUMN IF NOT EXISTS factoring_notes TEXT;

COMMENT ON COLUMN mdata.customers.factoring_eligible IS 'Whether invoices for this customer are eligible for factoring. Default true. Some direct shippers prefer non-factored billing or have agreements that prohibit factoring. Per blueprint line 4326.';
COMMENT ON COLUMN mdata.customers.factoring_company_vendor_id IS 'Vendor reference for the factoring company that purchases this customer''s invoices. NULL = use operating company default (set in Phase 5 banking module). Per blueprint line 5514.';
COMMENT ON COLUMN mdata.customers.factoring_advance_rate_override IS 'Per-customer advance rate override (0-100 percent). NULL = use factoring company default. Phase 5 banking config holds factor defaults.';
COMMENT ON COLUMN mdata.customers.factoring_reserve_pct_override IS 'Per-customer reserve hold percentage override. NULL = use factoring company default.';
COMMENT ON COLUMN mdata.customers.factoring_recourse_type IS 'Recourse type for this customer''s factored invoices. recourse = factor charges back if customer does not pay (typical Faro/RTS). non_recourse = factor eats the loss. NULL = use factoring company default.';
COMMENT ON COLUMN mdata.customers.factoring_notes IS 'Free-text notes about factoring arrangement for this specific customer.';

CREATE INDEX IF NOT EXISTS idx_customers_factoring_company
  ON mdata.customers (factoring_company_vendor_id)
  WHERE factoring_company_vendor_id IS NOT NULL
    AND deactivated_at IS NULL;

DO $$
DECLARE
  transp_id UUID;
  trk_id UUID;
BEGIN
  SELECT id INTO transp_id FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  SELECT id INTO trk_id FROM org.companies WHERE code = 'TRK' LIMIT 1;

  INSERT INTO mdata.vendors (
    vendor_name,
    vendor_type,
    operating_company_id,
    notes,
    created_by_user_id,
    updated_by_user_id
  )
  SELECT
    'Faro Factoring',
    'Other',
    transp_id,
    'Current invoice factoring company for IH 35 Transportation. ~3% effective cost per invoice (1.5% discount fee + 1.5% schedule fee + misc). Recourse 60-90 days. Daily reports downloaded manually from website. Subordination agreement with CCG: Faro sweeps part of proceeds and wires monthly to CCG for IH 35 Trucking equipment lease. Migration to RTS Financial planned ~late May/early June 2026.',
    NULL,
    NULL
  WHERE transp_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM mdata.vendors
      WHERE vendor_name = 'Faro Factoring'
        AND operating_company_id = transp_id
        AND deactivated_at IS NULL
    );

  INSERT INTO mdata.vendors (
    vendor_name,
    vendor_type,
    operating_company_id,
    notes,
    created_by_user_id,
    updated_by_user_id
  )
  SELECT
    'Commercial Credit Group',
    'Other',
    trk_id,
    'Equipment financing creditor for IH 35 Trucking LLC trucks/trailers. Monthly payment ~$45,510. Subordination agreement with Faro Factoring: Faro sweeps part of TRANSP factoring proceeds and wires directly to CCG. Loan paid through factor virtual bank, NOT through operating bank. When migrating Faro->RTS, subordination transfers to RTS. Phase 5 Banking module will track this formally via mdata.financing_arrangements + banking.factoring_transactions sweep logic.',
    NULL,
    NULL
  WHERE trk_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM mdata.vendors
      WHERE vendor_name = 'Commercial Credit Group'
        AND operating_company_id = trk_id
        AND deactivated_at IS NULL
    );
END $$;

COMMIT;
