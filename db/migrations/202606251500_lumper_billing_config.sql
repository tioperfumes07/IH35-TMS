-- [HOLD-FOR-JORGE — TIER 1] Lumper Lifecycle STEP 2: per-customer + per-stop lumper billing rule.
--
-- Encodes the Jorge-confirmed lumper money model WITHOUT a new enum. The 3 scenarios are expressed by the
-- EXISTING mdata.load_stops.lumper_paid_by enum combined with the new per-stop lumper_billable override:
--   scenario 1 broker-direct/comcheck : lumper_paid_by = 'broker'  -> $0 to carrier (broker's money)
--   scenario 2 we-pay, bill customer  : lumper_paid_by = 'carrier' AND billable -> expense + customer invoice
--   scenario 3 we-pay, absorb         : lumper_paid_by = 'carrier' AND NOT billable -> expense only, no invoice
--
-- (A) Customer-level default billing mode. 'flat_rate_includes' = the customer's flat rate already includes
--     lumper, so a we-pay lumper is booked as cost but NOT separately billed (suppressed). 'itemized'
--     (default) = bill the lumper as its own line. Constant default -> metadata-only add (no table rewrite).
-- (B) Per-stop override of whether a we-pay lumper at THIS stop is billed back to the customer. NULL =
--     inherit the customer's lumper_billing_mode; true = bill it; false = suppress for this stop/delivery
--     location. mdata.load_stops already has lumper_required / lumper_paid_by / lumper_amount_cents (wizard);
--     this only adds the missing billable override.
--
-- Both additive + idempotent. No behavior change — read only by the lumper logic behind LUMPER_LIFECYCLE_
-- ENABLED (default OFF), pending Jorge's Tier-1 sign-off. mdata.* schema (§1.3) -> [HOLD-FOR-JORGE].

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS lumper_billing_mode text NOT NULL DEFAULT 'itemized';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mdata.customers'::regclass AND conname = 'customers_lumper_billing_mode_check'
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT customers_lumper_billing_mode_check
      CHECK (lumper_billing_mode IN ('itemized', 'flat_rate_includes'));
  END IF;
END $$;

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS lumper_billable boolean NULL;

COMMENT ON COLUMN mdata.customers.lumper_billing_mode IS
  'Default lumper billing for this customer: itemized (bill lumper as its own line) | flat_rate_includes '
  '(flat rate already covers lumper -> we-pay lumper is booked as cost but not separately billed). Lumper Lifecycle STEP 2.';
COMMENT ON COLUMN mdata.load_stops.lumper_billable IS
  'Per-stop override of whether a we-pay (carrier-paid) lumper at this stop is billed back to the customer. '
  'NULL = inherit mdata.customers.lumper_billing_mode; true = bill; false = suppress. Lumper Lifecycle STEP 2.';
