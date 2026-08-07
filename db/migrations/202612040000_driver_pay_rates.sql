-- ACCT-F63 / WIRE-02 — driver_finance.driver_pay_rates: the per-driver pay basis.
--
-- WHY THIS TABLE EXISTS
-- Driver base pay had no source anywhere in the schema, so book-load.service.ts filled the hole with
-- the GROSS CUSTOMER RATE (bookLoadRateTotalCents) and every driver bill was written at 100% of the
-- load's revenue — proven on prod: all 3 driver_bills rows had gross_amount_cents exactly equal to
-- their load's rate_total_cents. That violates the locked driver model (Mexican-B1 1099 contractors
-- paid a wage/fee, NEVER a % of customer linehaul).
--
-- WHAT ALREADY EXISTED (searched before creating anything — §6):
--   * mdata.loads.miles_shortest / miles_practical      — the two mileage measurements
--   * mdata.drivers.pay_basis (miles_basis enum)        — WHICH measurement a driver is paid on
--   * driver_finance.driver_bills.miles_basis / miles_basis_type / rate_per_mile_cents
--   * driver_finance.driver_pay_settings                — net-pay floor, worker class, FLSA, escrow
-- driver_pay_settings is POLICY, not price: it has no rate column. Nothing stored what a mile or a
-- load is WORTH. That is the only genuinely missing piece, and it is what this adds.
--
-- BASIS (owner-confirmed, sourced from the approved Load Wizard prototype: "Shortest miles used for
-- driver pay"; practical miles are for fuel/ETA):
--   per_mile_pay -> rate_per_mile_cents x the load's SHORTEST miles
--   per_load_pay -> flat_per_load_cents
-- These mirror the settlement-line pay types already modelled in driver_finance.
--
-- Effective-dated rather than one row per driver: pay rates change, and a settlement must be
-- reproducible at the rate that applied on its load's date (McLeod/NetSuite behaviour). Superseding a
-- rate closes effective_to — rows are never deleted (void-not-delete).
--
-- CANONICAL-CHECK: driver_pay_rate. This is a RATE CARD (a price list), not a money ledger — it
-- records what a mile or a load is WORTH for a driver, and never holds an amount owed, paid, or
-- posted. Checked against every existing canonical money concept before creating it:
--   * driver_finance.driver_pay_settings — PER-DRIVER but POLICY, not price: net_pay_floor_pct,
--     worker_class, flsa_min_wage_cents_per_hour, escrow_target_cents. It has NO rate column, so it
--     cannot express what a driver is paid. Distinct concept; left untouched, not superseded.
--   * driver_finance.driver_bills — the PAYABLE (gross_amount_cents per load). That is the ledger;
--     this table is the input that prices it. One ledger, one rate card.
--   * driver_finance.settlement_lines / driver_settlements — the SETTLEMENT ledger (what was paid).
--     Downstream of the bill, still not a rate source.
--   * accounting.settlement_posting_config — ENTITY-level posting policy (floor %, worker class),
--     not a per-driver price.
--   * mdata.loads.driver_pay_rate_per_mile — a PER-LOAD override that exists but is NULL on all 4
--     loads; a per-load override is not a per-driver rate card and cannot answer "what does this
--     driver earn" before a load exists. Left in place; this table is the driver-level default.
-- No existing canonical ledger covers "the agreed price of a driver's mile/load", which is exactly
-- why book-load.service.ts fell back to the CUSTOMER rate. This adds the missing rate card; it does
-- not add a second ledger.
--
-- Additive and idempotent. Creates no GL, posts nothing, and changes no existing table.

DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NULL OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'prerequisite tables absent — skipping driver_pay_rates';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS driver_finance.driver_pay_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id uuid NOT NULL REFERENCES org.companies(id),
    driver_id uuid NOT NULL REFERENCES mdata.drivers(id),

    -- Which basis this row expresses. Matches the settlement-line pay types.
    basis_type text NOT NULL CHECK (basis_type IN ('per_mile_pay', 'per_load_pay')),

    -- Exactly one of these carries the money, enforced by the CHECK below.
    rate_per_mile_cents bigint NULL CHECK (rate_per_mile_cents IS NULL OR rate_per_mile_cents >= 0),
    flat_per_load_cents bigint NULL CHECK (flat_per_load_cents IS NULL OR flat_per_load_cents >= 0),

    -- Which mileage measurement a per-mile rate multiplies. Default short_miles because the approved
    -- prototype states shortest miles are what a driver is paid on; practical miles are fuel/ETA.
    miles_basis text NOT NULL DEFAULT 'short_miles'
      CHECK (miles_basis IN ('short_miles', 'practical_miles')),

    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date NULL,

    -- §7 — a labelled placeholder used to exercise the skeleton is NOT production truth. Anything
    -- seeded for testing carries this flag so it can never be mistaken for an owner-entered rate,
    -- and so the posting path can refuse to settle real money against test rates.
    is_test_data boolean NOT NULL DEFAULT false,

    notes text NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by_user_id uuid NULL REFERENCES identity.users(id),
    updated_by_user_id uuid NULL REFERENCES identity.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT driver_pay_rates_amount_matches_basis CHECK (
      (basis_type = 'per_mile_pay' AND rate_per_mile_cents IS NOT NULL)
      OR (basis_type = 'per_load_pay' AND flat_per_load_cents IS NOT NULL)
    ),
    CONSTRAINT driver_pay_rates_effective_range CHECK (
      effective_to IS NULL OR effective_to >= effective_from
    )
  );
END $$;

-- Resolution lookup: "the active rate for this driver, in this entity, on this date".
CREATE INDEX IF NOT EXISTS idx_driver_pay_rates_lookup
  ON driver_finance.driver_pay_rates (operating_company_id, driver_id, effective_from DESC)
  WHERE is_active AND effective_to IS NULL;

-- One open (un-ended) active rate per driver per entity — otherwise resolution is ambiguous and a
-- settlement could silently pick either rate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_pay_rates_one_open
  ON driver_finance.driver_pay_rates (operating_company_id, driver_id)
  WHERE is_active AND effective_to IS NULL;

ALTER TABLE driver_finance.driver_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_pay_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_pay_rates_tenant_scope ON driver_finance.driver_pay_rates;
CREATE POLICY driver_pay_rates_tenant_scope ON driver_finance.driver_pay_rates
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- Without this the runtime role 500s on first read (§2).
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_pay_rates TO ih35_app;

COMMENT ON TABLE driver_finance.driver_pay_rates IS
  'Per-driver pay basis. per_mile_pay x mdata.loads.miles_shortest, or per_load_pay flat. Effective-'
  'dated so a settlement reproduces the rate that applied on its load date. NEVER derived from the '
  'customer rate (locked driver model: wage/fee, never a % of linehaul). is_test_data marks labelled '
  'placeholders that are not owner-entered operational truth.';
