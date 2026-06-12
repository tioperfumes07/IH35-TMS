-- C1-PRE-SETTLEMENTS: settlement schema read model (no financial writes)
BEGIN;

CREATE SCHEMA IF NOT EXISTS settlement;

-- ── settlement.settlement ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement.settlement (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  driver_id             uuid        NOT NULL REFERENCES mdata.drivers(id),
  pay_period_start      date        NOT NULL,
  pay_period_end        date        NOT NULL,
  status                text        NOT NULL DEFAULT 'open'
                                    CHECK (status IN ('open', 'ready', 'closed', 'disputed')),
  gross_cents           bigint      NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
  deductions_cents      bigint      NOT NULL DEFAULT 0 CHECK (deductions_cents >= 0),
  net_cents             bigint      NOT NULL DEFAULT 0,
  notes                 text,
  created_by_user_id    uuid        REFERENCES identity.users(id),
  updated_by_user_id    uuid        REFERENCES identity.users(id),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_company_driver_period
  ON settlement.settlement (operating_company_id, driver_id, pay_period_start, pay_period_end)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_settlement_company_status
  ON settlement.settlement (operating_company_id, status) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_settlement_driver
  ON settlement.settlement (driver_id) WHERE is_active = true;

-- ── settlement.settlement_line ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement.settlement_line (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id         uuid        NOT NULL REFERENCES settlement.settlement(id) ON DELETE CASCADE,
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  load_id               uuid        REFERENCES mdata.loads(id),
  line_type             text        NOT NULL CHECK (
                          line_type IN ('load_pay', 'mileage_pay', 'extra_pay', 'reimbursement', 'other')
                        ),
  description           text        NOT NULL CHECK (length(trim(description)) >= 1),
  amount_cents          bigint      NOT NULL,
  source_table          text,
  source_reference_id   uuid,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_settlement_line_settlement
  ON settlement.settlement_line (settlement_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_settlement_line_load
  ON settlement.settlement_line (load_id) WHERE load_id IS NOT NULL AND is_active = true;

-- ── settlement.settlement_deduction ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement.settlement_deduction (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id         uuid        NOT NULL REFERENCES settlement.settlement(id) ON DELETE CASCADE,
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  driver_id             uuid        NOT NULL REFERENCES mdata.drivers(id),
  deduction_type        text        NOT NULL CHECK (
                          deduction_type IN (
                            'banking_tag', 'violation_fine', 'accident_cost',
                            'company_paid_fine', 'chargeback', 'other'
                          )
                        ),
  source_table          text,
  source_reference_id   uuid,
  description           text        NOT NULL CHECK (length(trim(description)) >= 1),
  amount_cents          bigint      NOT NULL CHECK (amount_cents > 0),
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_settlement_deduction_settlement
  ON settlement.settlement_deduction (settlement_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_settlement_deduction_driver
  ON settlement.settlement_deduction (driver_id) WHERE is_active = true;

-- ── updated_at triggers ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settlement_updated_at'
  ) THEN
    CREATE TRIGGER trg_settlement_updated_at
      BEFORE UPDATE ON settlement.settlement
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settlement_line_updated_at'
  ) THEN
    CREATE TRIGGER trg_settlement_line_updated_at
      BEFORE UPDATE ON settlement.settlement_line
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settlement_deduction_updated_at'
  ) THEN
    CREATE TRIGGER trg_settlement_deduction_updated_at
      BEFORE UPDATE ON settlement.settlement_deduction
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE settlement.settlement          ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement.settlement_line     ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement.settlement_deduction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_settlement_company         ON settlement.settlement;
DROP POLICY IF EXISTS rls_settlement_line_company    ON settlement.settlement_line;
DROP POLICY IF EXISTS rls_settlement_deduction_company ON settlement.settlement_deduction;

CREATE POLICY rls_settlement_company ON settlement.settlement
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE POLICY rls_settlement_line_company ON settlement.settlement_line
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE POLICY rls_settlement_deduction_company ON settlement.settlement_deduction
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

COMMIT;
