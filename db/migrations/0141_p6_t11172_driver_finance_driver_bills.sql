-- P6-T11172 — driver_finance.driver_bills proper table + idempotent backfill
-- Discriminator for legacy lockstep driver bills in accounting.bills:
--   memo ILIKE 'Auto-created from load %' AND successful join to mdata.loads by
--   canonical numeric/date suffix (handles legacy display_id/B- values that
--   repeated the L- prefix, e.g. B-L-YYYYMMDD-seq ↔ L-YYYYMMDD-seq).
-- accounting.bills schema and rows are LEFT UNCHANGED (read-only SELECT source).

BEGIN;

CREATE SCHEMA IF NOT EXISTS driver_finance;

CREATE TABLE IF NOT EXISTS driver_finance.driver_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_id UUID NOT NULL REFERENCES mdata.loads(id) ON DELETE RESTRICT,
  load_number TEXT NOT NULL,
  bill_number TEXT NOT NULL UNIQUE,
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id),
  team_driver_id UUID REFERENCES mdata.drivers(id),
  gross_amount_cents INTEGER NOT NULL DEFAULT 0,
  miles_basis INTEGER,
  miles_basis_type TEXT CHECK (miles_basis_type IS NULL OR miles_basis_type IN ('short', 'practical')),
  rate_per_mile_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'paid', 'void', 'disputed')),
  settled_in_settlement_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES identity.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_legacy_bill_id UUID
);

CREATE INDEX IF NOT EXISTS ix_driver_bills_load_id
  ON driver_finance.driver_bills(load_id);
CREATE INDEX IF NOT EXISTS ix_driver_bills_driver_id
  ON driver_finance.driver_bills(driver_id);
CREATE INDEX IF NOT EXISTS ix_driver_bills_operating_company_id
  ON driver_finance.driver_bills(operating_company_id);
CREATE INDEX IF NOT EXISTS ix_driver_bills_settled
  ON driver_finance.driver_bills(settled_in_settlement_id)
  WHERE settled_in_settlement_id IS NOT NULL;

ALTER TABLE driver_finance.driver_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_bills_company_isolation ON driver_finance.driver_bills;
CREATE POLICY driver_bills_company_isolation ON driver_finance.driver_bills
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP TRIGGER IF EXISTS trg_driver_bills_touch ON driver_finance.driver_bills;
CREATE TRIGGER trg_driver_bills_touch
  BEFORE UPDATE ON driver_finance.driver_bills
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_updated_at();

-- Baseline settlement_lines BEFORE 0156/0158 guarded ALTERs (those migrations assumed optional pre-existing DDL).
CREATE TABLE IF NOT EXISTS driver_finance.settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements (id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  team_id uuid REFERENCES mdata.driver_teams (id),
  source_driver_bill_id uuid REFERENCES driver_finance.driver_bills (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_lines_line_type_chk_p6_t11186 CHECK (
    line_type IN (
      'earnings',
      'extra_pay',
      'reimbursement',
      'deduction',
      'abandonment_chargeback',
      'team_split_primary',
      'team_split_secondary'
    )
  )
);

CREATE INDEX IF NOT EXISTS ix_settlement_lines_settlement_id ON driver_finance.settlement_lines (settlement_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_settlement_lines_source_driver_bill_id
  ON driver_finance.settlement_lines (source_driver_bill_id)
  WHERE source_driver_bill_id IS NOT NULL;

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_bills TO ih35_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.settlement_lines TO ih35_app;
  END IF;
END
$$;

INSERT INTO driver_finance.driver_bills (
  operating_company_id,
  load_id,
  load_number,
  bill_number,
  driver_id,
  team_driver_id,
  gross_amount_cents,
  miles_basis,
  miles_basis_type,
  rate_per_mile_cents,
  status,
  notes,
  created_at,
  created_by_user_id,
  source_legacy_bill_id
)
SELECT
  ab.operating_company_id,
  l.id,
  l.load_number,
  'B-' || regexp_replace(l.load_number, '^[Ll]-', ''),
  COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id),
  CASE
    WHEN l.assigned_primary_driver_id IS NOT NULL AND l.assigned_secondary_driver_id IS NOT NULL
    THEN l.assigned_secondary_driver_id
    ELSE NULL
  END,
  LEAST(GREATEST(COALESCE(ab.amount_cents, 0), -2147483648::bigint), 2147483647::bigint)::integer,
  CASE
    WHEN COALESCE(l.miles_shortest, 0) > 0 THEN l.miles_shortest
    WHEN COALESCE(l.miles_practical, 0) > 0 THEN l.miles_practical
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(l.miles_shortest, 0) > 0 THEN 'short'::text
    WHEN COALESCE(l.miles_practical, 0) > 0 THEN 'practical'::text
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(l.miles_shortest, 0) > 0 AND COALESCE(ab.amount_cents, 0) <> 0
      THEN ROUND(ab.amount_cents::numeric / NULLIF(l.miles_shortest, 0))::integer
    WHEN COALESCE(l.miles_practical, 0) > 0 AND COALESCE(ab.amount_cents, 0) <> 0
      THEN ROUND(ab.amount_cents::numeric / NULLIF(l.miles_practical, 0))::integer
    ELSE NULL
  END,
  CASE WHEN ab.status IN ('paid') THEN 'paid' ELSE 'open' END,
  'Migrated from accounting.bills (' || ab.id::text || ') on ' || now()::text,
  ab.created_at,
  ab.created_by_user_id,
  ab.id
FROM accounting.bills ab
INNER JOIN mdata.loads l
  ON l.operating_company_id = ab.operating_company_id
 AND regexp_replace(regexp_replace(COALESCE(ab.display_id, ab.bill_number, ''), '^[Bb]-', ''), '^[Ll]-', '')
    = regexp_replace(l.load_number, '^[Ll]-', '')
 AND l.soft_deleted_at IS NULL
WHERE ab.revoked_at IS NULL
  AND ab.memo ILIKE 'Auto-created from load %'
  AND COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM driver_finance.driver_bills db
    WHERE db.source_legacy_bill_id = ab.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM driver_finance.driver_bills db
    WHERE db.bill_number = ('B-' || regexp_replace(l.load_number, '^[Ll]-', ''))
      AND db.operating_company_id = ab.operating_company_id
  );

COMMIT;
