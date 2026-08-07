-- LOAN-08 — auto-deduct policy extension: a related-party loan can drive a settlement deduction.
--
-- WHAT THE SPEC ASKS FOR (§3.5 / §4.5): "extend settlements/auto-deductions to accept a loan schedule as
-- the deduction source (policy references loan_id)". Verified on prod br-fancy-credit-akjnd07a before
-- writing a line of this:
--
--   driver_finance.auto_deduction_policies has NO loan column. It has `source_ref uuid` — but source_ref
--   carries NO foreign key, so pointing it at a loan gives referential integrity of exactly zero: the
--   loan could be deleted, or the uuid could be a settlement id, or a typo, and the database would
--   accept all three. The spec's own linkage guard ("an entry with no link → FAIL") cannot be enforced
--   against an unconstrained uuid. A real column with a real FK is the difference between a link and a
--   number that looks like one.
--
--   deduction_type FKs to catalogs.driver_deduction_types(operating_company_id, code). All three entities
--   carry the SAME 7 codes and none of them is a loan repayment:
--     ABANDONMENT, DAMAGE, DAMAGE-CLAIM, INS-DED, LOAD-ABANDONMENT, MANUAL-PROPOSAL, SAFETY-FINE
--   So without a new catalog row the insert cannot even be written — the FK rejects it.
--
-- TRANSP + USMCA ONLY, NOT TRK. The other 7 codes are seeded identically across all three entities, so
-- the symmetric choice would be to seed all three. Deliberately not doing that: TRK is the asset holder,
-- it holds no related-party loans, and (verified same session) it has NO related_party_interest_expense
-- role and NO 1260 Interest Receivable. Seeding the code there would let someone create a TRK loan-
-- repayment policy that passes every constraint and can never post its interest — a capability that
-- exists but cannot complete. Better that the FK refuses it at the door.
--
-- driver_finance.auto_deduction_policies is EMPTY on prod (0 rows, n_live_tup 0), so the new column
-- backfills nothing and no existing policy changes meaning.
--
-- IDEMPOTENT throughout (IF NOT EXISTS / ON CONFLICT). void-not-delete: nothing is dropped or deleted.

BEGIN;

-- RLS is FORCED on both tables touched here, and identity.is_lucia_bypass() is the only branch that sees
-- across entities. Without this the assertions at the bottom read an empty table and "pass" against a
-- database where nothing was written — the exact failure mode found in 202611250000, where fail-closed
-- assertions were RLS-blind and aborted a correct migration.
SET LOCAL app.bypass_rls = 'lucia';

-- ── 1. The link itself ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance'
      AND table_name = 'auto_deduction_policies'
      AND column_name = 'related_party_loan_id'
  ) THEN
    ALTER TABLE driver_finance.auto_deduction_policies
      ADD COLUMN related_party_loan_id uuid NULL
        REFERENCES accounting.related_party_loan_entries(id);
  END IF;
END $$;

COMMENT ON COLUMN driver_finance.auto_deduction_policies.related_party_loan_id IS
  'LOAN-08: the related-party loan this policy repays. NULL for every other deduction type. Distinct '
  'from source_ref, which is an unconstrained uuid and therefore cannot be relied on as a link.';

-- Partial index: the loan → policies reverse lookup (§10a requires the reverse direction to be cheap,
-- not merely possible). Partial because the column is NULL for every non-loan policy.
CREATE INDEX IF NOT EXISTS auto_deduction_policies_related_party_loan_idx
  ON driver_finance.auto_deduction_policies (related_party_loan_id)
  WHERE related_party_loan_id IS NOT NULL;

-- ── 2. The two halves must agree ──────────────────────────────────────────────────────────────────
-- A LOAN-REPAYMENT policy with no loan is a deduction against nothing; a policy carrying a loan under
-- some other type would deduct a loan repayment while reporting itself as, say, a safety fine — and the
-- settlement line would show the wrong reason to the driver whose pay it reduces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_deduction_policies_loan_type_chk'
  ) THEN
    ALTER TABLE driver_finance.auto_deduction_policies
      ADD CONSTRAINT auto_deduction_policies_loan_type_chk
      CHECK (
        (deduction_type = 'LOAN-REPAYMENT' AND related_party_loan_id IS NOT NULL)
        OR (deduction_type <> 'LOAN-REPAYMENT' AND related_party_loan_id IS NULL)
      );
  END IF;
END $$;

-- ── 3. The catalog code, per entity ───────────────────────────────────────────────────────────────
-- may_draw_escrow = false: a loan repayment is a debt the driver agreed to, not a company loss being
-- recovered. Escrow exists to cover damage/abandonment the driver caused; draining it to repay an
-- owner-arranged loan would convert the driver's own held funds into loan collateral nobody agreed to.
-- survives_separation = true: the debt does not evaporate because the driver leaves.
-- default_recovery_rail = 'settlement' is set EXPLICITLY rather than inheriting the column default
-- 'ask'. 'ask' prompts for a rail every time, and one of the rails on offer is escrow — so the default
-- would put the wrong answer in front of a dispatcher on every single repayment. Settlement pay is the
-- only correct rail here, and it satisfies ck_driver_deduction_types_escrow_rail_coherent alongside
-- may_draw_escrow = false.
INSERT INTO catalogs.driver_deduction_types
  (operating_company_id, code, display_name, description, is_active, sort_order,
   may_draw_escrow, default_recovery_rail, survives_separation)
SELECT c.id, 'LOAN-REPAYMENT', 'Loan Repayment',
       'Scheduled repayment of a related-party loan or advance (principal + interest per the loan schedule).',
       true, 80, false, 'settlement', true
FROM org.companies c
WHERE c.code IN ('TRANSP', 'USMCA')
ON CONFLICT (operating_company_id, code) DO NOTHING;

-- ── 4. Fail closed ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  seeded int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'auto_deduction_policies'
      AND column_name = 'related_party_loan_id'
  ) THEN
    RAISE EXCEPTION 'LOAN-08: related_party_loan_id was not created — the policy→loan link does not exist';
  END IF;

  SELECT count(*) INTO seeded
  FROM catalogs.driver_deduction_types d
  JOIN org.companies c ON c.id = d.operating_company_id
  WHERE d.code = 'LOAN-REPAYMENT' AND c.code IN ('TRANSP', 'USMCA') AND d.is_active;

  IF seeded <> 2 THEN
    RAISE EXCEPTION
      'LOAN-08: expected LOAN-REPAYMENT on both operating entities, found % — a policy insert would be '
      'rejected by the deduction_type FK on the entity that is missing it', seeded;
  END IF;

  -- The CHECK is what stops a loan repayment from masquerading as another deduction type. Without it
  -- the column is decorative.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auto_deduction_policies_loan_type_chk') THEN
    RAISE EXCEPTION 'LOAN-08: the loan/type agreement CHECK is missing — type and loan could disagree';
  END IF;
END $$;

COMMIT;
