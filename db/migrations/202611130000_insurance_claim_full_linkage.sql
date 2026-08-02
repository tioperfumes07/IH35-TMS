-- INS-F02 — wire insurance.claim to the rest of the system (LINKAGE LAW §10.3).
--
-- VERIFIED STATE BEFORE THIS MIGRATION (prod br-fancy-credit-akjnd07a, 2026-08-02, pg_constraint):
-- insurance.claim already carries SEVEN canonical FKs — policy_id -> insurance.policy,
-- asset_id -> mdata.assets (vehicle), trailer_id -> mdata.equipment, driver_id -> mdata.drivers,
-- load_id -> mdata.loads, accident_report_id -> safety.accident_reports (safety), and
-- tenant_id -> org.companies — plus claim_number, deductible_cents, fault, driver_responsible,
-- recovery_rail and repair_books_treatment as columns.
--
-- SIX LINKS WERE MISSING, and a claim could not reach the money side of the business at all:
--   vendor_id      the shop that performed the repair          -> mdata.vendors
--   bill_id        the A/P bill for that repair                -> accounting.bills
--   expense_id     a directly-booked claim expense             -> accounting.expenses
--   lawsuit_id     litigation arising from the claim           -> insurance.lawsuit
--   deduction_id   recovery taken from driver pay              -> driver_finance.driver_settlement_deductions
--   liability_id   amount the driver owes                      -> driver_finance.driver_liabilities
-- The last two were self-disclosed by the code's own /graph endpoint; driver_liabilities previously
-- wired ONLY to internal fines and never to claims. The other four were found by reading
-- pg_constraint rather than by report.
--
-- CAPABILITY ONLY — NO ROUTING POLICY. This migration makes the links EXPRESSIBLE. It does not decide
-- WHEN a claim becomes a driver deduction versus an insurance liability versus a company expense
-- (at-fault, deductible-to-driver, subrogation). That rule moves money against a driver's pay and is
-- an OWNER decision that is not yet made; nothing here writes a row, sets a default, or infers a
-- route. Every column is NULLable and every value is entered deliberately.
--
-- ADDITIVE AND IDEMPOTENT: ADD COLUMN IF NOT EXISTS + a guarded ADD CONSTRAINT. No column is dropped,
-- renamed or retyped; no row is written. ON DELETE SET NULL everywhere so voiding/archiving a bill,
-- expense or deduction never cascades into destroying claim evidence — insurance claims are legal
-- evidence and must survive the lifecycle of anything they reference.
--
-- ENTITY SCOPING: insurance.claim carries both tenant_id and operating_company_id; the referenced
-- rows are entity-scoped by their own tables' RLS. security is unchanged by this migration.
-- Columns carry their FK INLINE. An earlier draft added bare uuid columns and attached constraints in
-- a separate loop; verify-orphan-fk-inventory rejects that shape, and it is right to — a column that
-- exists for even one migration without its REFERENCES is an unenforced id, and unenforced id columns
-- are how orphaned money references get created. ADD COLUMN IF NOT EXISTS keeps it idempotent.
DO $$
BEGIN
  IF to_regclass('mdata.vendors') IS NULL
     OR to_regclass('accounting.bills') IS NULL
     OR to_regclass('accounting.expenses') IS NULL
     OR to_regclass('insurance.lawsuit') IS NULL
     OR to_regclass('driver_finance.driver_settlement_deductions') IS NULL
     OR to_regclass('driver_finance.driver_liabilities') IS NULL THEN
    RAISE EXCEPTION 'INS-F02: an FK target is missing — refusing to link insurance.claim to a phantom relation';
  END IF;
END
$$;

ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS vendor_id uuid
  REFERENCES mdata.vendors(id) ON DELETE SET NULL;
ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS bill_id uuid
  REFERENCES accounting.bills(id) ON DELETE SET NULL;
ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS expense_id uuid
  REFERENCES accounting.expenses(id) ON DELETE SET NULL;
ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS lawsuit_id uuid
  REFERENCES insurance.lawsuit(id) ON DELETE SET NULL;
ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS deduction_id uuid
  REFERENCES driver_finance.driver_settlement_deductions(id) ON DELETE SET NULL;
ALTER TABLE insurance.claim ADD COLUMN IF NOT EXISTS liability_id uuid
  REFERENCES driver_finance.driver_liabilities(id) ON DELETE SET NULL;

-- Reverse drill-through: every link must be traversable claim -> target AND target -> claim.
CREATE INDEX IF NOT EXISTS idx_claim_vendor_id    ON insurance.claim (vendor_id)    WHERE vendor_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_bill_id      ON insurance.claim (bill_id)      WHERE bill_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_expense_id   ON insurance.claim (expense_id)   WHERE expense_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_lawsuit_id   ON insurance.claim (lawsuit_id)   WHERE lawsuit_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_deduction_id ON insurance.claim (deduction_id) WHERE deduction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_liability_id ON insurance.claim (liability_id) WHERE liability_id IS NOT NULL;
