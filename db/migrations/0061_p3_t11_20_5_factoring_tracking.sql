BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS views;

-- ============================================================
-- ACCOUNTING.INVOICES extension — factoring linkage
-- ============================================================
ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS factoring_advance_id uuid,
  ADD COLUMN IF NOT EXISTS factoring_status text
    CHECK (
      factoring_status IN (
        'not_factored',
        'submitted',
        'advanced',
        'reserve_held',
        'collected',
        'released',
        'recourse_returned'
      )
    ) DEFAULT 'not_factored';

CREATE INDEX IF NOT EXISTS idx_invoices_factoring_status
  ON accounting.invoices (factoring_status)
  WHERE factoring_status NOT IN ('not_factored', 'released');

-- ============================================================
-- ACCOUNTING.FACTORING_ADVANCES (one row per factoring submission)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting.factoring_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  factoring_company_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id) ON DELETE RESTRICT,
  display_id text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (
      status IN (
        'submitted',
        'advanced',
        'reserve_held',
        'collected',
        'released',
        'recourse_returned',
        'disputed',
        'voided'
      )
    ),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submission_batch_ref text,
  invoice_total_cents bigint NOT NULL CHECK (invoice_total_cents >= 0),
  advance_rate_pct numeric(5,2) NOT NULL CHECK (advance_rate_pct >= 0 AND advance_rate_pct <= 100),
  advance_amount_cents bigint NOT NULL CHECK (advance_amount_cents >= 0),
  reserve_pct numeric(5,2) NOT NULL CHECK (reserve_pct >= 0 AND reserve_pct <= 100),
  reserve_amount_cents bigint NOT NULL CHECK (reserve_amount_cents >= 0),
  factor_fee_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (factor_fee_pct >= 0 AND factor_fee_pct <= 100),
  factor_fee_cents bigint NOT NULL DEFAULT 0 CHECK (factor_fee_cents >= 0),
  release_amount_cents bigint NOT NULL DEFAULT 0 CHECK (release_amount_cents >= 0),
  advanced_at timestamptz,
  collected_at timestamptz,
  released_at timestamptz,
  recourse_returned_at timestamptz,
  recourse_reason text,
  notes text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (operating_company_id, display_id)
);

CREATE INDEX IF NOT EXISTS idx_factoring_advances_status
  ON accounting.factoring_advances (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_factoring_advances_vendor
  ON accounting.factoring_advances (factoring_company_vendor_id);

ALTER TABLE accounting.invoices
  DROP CONSTRAINT IF EXISTS fk_invoices_factoring_advance;
ALTER TABLE accounting.invoices
  ADD CONSTRAINT fk_invoices_factoring_advance
  FOREIGN KEY (factoring_advance_id)
  REFERENCES accounting.factoring_advances(id)
  ON DELETE SET NULL;

-- ============================================================
-- VIEWS.FACTORING_SUMMARY
-- Keep legacy columns used by factoring module while sourcing
-- values from the real factoring advances table.
-- ============================================================
CREATE OR REPLACE VIEW views.factoring_summary
WITH (security_invoker = true)
AS
WITH by_vendor AS (
  SELECT
    fa.operating_company_id,
    fa.factoring_company_vendor_id,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status <> 'voided')::int AS total_advances,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'reserve_held')::int AS reserves_pending,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'released')::int AS reserves_released,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'recourse_returned')::int AS recourse_returns,
    COALESCE(SUM(fa.advance_amount_cents) FILTER (WHERE fa.status <> 'voided'), 0)::bigint AS advanced_total_cents,
    COALESCE(SUM(fa.reserve_amount_cents) FILTER (WHERE fa.status IN ('reserve_held', 'collected')), 0)::bigint AS reserve_pending_cents,
    COALESCE(SUM(fa.release_amount_cents) FILTER (WHERE fa.status = 'released'), 0)::bigint AS released_total_cents,
    COALESCE(SUM(fa.factor_fee_cents) FILTER (WHERE fa.status IN ('released', 'recourse_returned')), 0)::bigint AS factor_fees_total_cents,
    COUNT(DISTINCT i.id)::int AS factored_invoice_count,
    MAX(fa.advanced_at) AS last_advance_at
  FROM accounting.factoring_advances fa
  LEFT JOIN accounting.invoices i ON i.factoring_advance_id = fa.id
  WHERE fa.status <> 'voided'
  GROUP BY fa.operating_company_id, fa.factoring_company_vendor_id
),
active_vendor AS (
  SELECT DISTINCT ON (bv.operating_company_id)
    bv.operating_company_id,
    bv.factoring_company_vendor_id AS active_factor_id,
    v.vendor_name AS active_factor_name,
    bv.last_advance_at
  FROM by_vendor bv
  LEFT JOIN mdata.vendors v ON v.id = bv.factoring_company_vendor_id
  ORDER BY bv.operating_company_id, bv.last_advance_at DESC NULLS LAST, bv.factoring_company_vendor_id
),
rollup AS (
  SELECT
    bv.operating_company_id,
    COUNT(DISTINCT bv.factoring_company_vendor_id)::int AS active_factor_count,
    COALESCE(SUM(bv.advanced_total_cents), 0)::bigint AS mtd_advanced_total,
    COALESCE(SUM(bv.total_advances), 0)::int AS mtd_advances_count,
    COALESCE(SUM(bv.reserve_pending_cents), 0)::bigint AS reserve_balance
  FROM by_vendor bv
  GROUP BY bv.operating_company_id
)
SELECT
  bv.operating_company_id,
  av.active_factor_id,
  COALESCE(av.active_factor_name, 'Factoring')::text AS active_factor_name,
  90::int AS recourse_days,
  COALESCE(r.reserve_balance, 0)::numeric AS reserve_balance,
  0::numeric AS chargeback_balance,
  av.last_advance_at,
  COALESCE(r.active_factor_count, 0)::int AS active_factor_count,
  (COALESCE(r.active_factor_count, 0) <= 1) AS single_factor_invariant_ok,
  COALESCE(r.mtd_advances_count, 0)::int AS mtd_advances_count,
  COALESCE(r.mtd_advanced_total, 0)::numeric AS mtd_advanced_total,
  bv.factoring_company_vendor_id,
  bv.total_advances,
  bv.reserves_pending,
  bv.reserves_released,
  bv.recourse_returns,
  bv.advanced_total_cents,
  bv.reserve_pending_cents,
  bv.released_total_cents,
  bv.factor_fees_total_cents,
  bv.factored_invoice_count
FROM by_vendor bv
LEFT JOIN active_vendor av ON av.operating_company_id = bv.operating_company_id
LEFT JOIN rollup r ON r.operating_company_id = bv.operating_company_id;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE accounting.factoring_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_advances_company_scope ON accounting.factoring_advances;
CREATE POLICY factoring_advances_company_scope
  ON accounting.factoring_advances
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

COMMIT;
