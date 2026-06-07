-- Migration 0327: Drug & Alcohol Program Management (GAP-81)
-- FMCSA Part 382 — consortium enrollment, test records, random pool draws
-- Additive alongside compliance.drug_alcohol_* tables (different schema/layer).

-- ─────────────────────────────────────────────────────────────────────────────
-- Consortium enrollment
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety.da_program_enrollments (
  uuid              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT     NOT NULL,
  driver_uuid       UUID        NOT NULL,
  consortium_name   TEXT        NOT NULL,
  enrolled_at       DATE        NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS da_program_enrollments_company_driver_idx
  ON safety.da_program_enrollments (operating_company_id, driver_uuid);

CREATE INDEX IF NOT EXISTS da_program_enrollments_active_idx
  ON safety.da_program_enrollments (operating_company_id, is_active)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Individual test records (all six FMCSA Part 382 test types)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety.da_test_records (
  uuid                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  TEXT        NOT NULL,
  driver_uuid           UUID        NOT NULL,
  test_type             TEXT        NOT NULL
    CHECK (test_type IN ('pre_employment','random','post_accident','reasonable_suspicion','return_to_duty','follow_up')),
  test_kind             TEXT        NOT NULL
    CHECK (test_kind IN ('drug','alcohol','both')),
  scheduled_at          TIMESTAMPTZ,
  collected_at          TIMESTAMPTZ,
  result                TEXT
    CHECK (result IN ('pending','negative','positive','refused','cancelled')),
  chain_of_custody_id   TEXT,
  sap_referral_uuid     UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS da_test_records_company_driver_idx
  ON safety.da_test_records (operating_company_id, driver_uuid);

CREATE INDEX IF NOT EXISTS da_test_records_result_idx
  ON safety.da_test_records (operating_company_id, result)
  WHERE result = 'positive';

-- ─────────────────────────────────────────────────────────────────────────────
-- Quarterly random pool draws (audit trail — FMCSA compliance)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety.da_random_pool_draws (
  uuid                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  TEXT        NOT NULL,
  draw_date             DATE        NOT NULL,
  pool_size             INTEGER     NOT NULL,
  drug_drawn_count      INTEGER     NOT NULL,
  alcohol_drawn_count   INTEGER     NOT NULL,
  drawn_driver_uuids    UUID[]      NOT NULL,
  drawn_test_kinds      JSONB       NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS da_random_pool_draws_company_date_idx
  ON safety.da_random_pool_draws (operating_company_id, draw_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON
  safety.da_program_enrollments,
  safety.da_test_records,
  safety.da_random_pool_draws
TO ih35_app;
