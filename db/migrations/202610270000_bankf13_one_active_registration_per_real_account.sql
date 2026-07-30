-- BANK-F13 — one real bank account may have only ONE active registration.
--
-- ROOT CAUSE. Re-linking a bank account (Plaid re-auth, institution change) inserts a SECOND
-- `banking.bank_accounts` row for the SAME real account, and the feed re-imports the whole history
-- against it. Nothing prevented the second registration, and dedup cannot see the result: its unique
-- index is `(bank_account_id, dedup_hash)` — per ACCOUNT — so two rows for one real account dedup
-- independently, and their hashes differ anyway.
--
-- PROD EVIDENCE (br-fancy-credit-akjnd07a, bypass_rls in its OWN statement, 2026-07-30):
--     entity  institution      mask   rows  active  txns
--     USMCA   Bank of America  3224     2      1     48 + 104   <- 48 are byte-identical copies
--     TRK     Wells Fargo      3500     2      1    216 +   0
--     TRK     Wells Fargo      6103     2      0   1732 +   0
--     TRK     Wells Fargo      6129     2      0    926 +   0
--     TRK     Wells Fargo      6137     2      0   1961 +   0
--   Only USMCA/3224 actually duplicated transactions: all 48 rows on the deactivated registration
--   match a transaction on the active one by date + amount + description, with same_dedup_hash = 0.
--   The four TRK pairs are empty shells — the twin carries no transactions, so nothing is duplicated
--   there. Stated precisely because "five duplicate pairs" would overstate it: the money defect is one.
--
-- WHAT WAS AND WAS NOT AT RISK. Cash was never overstated: sumAuthoritativeDepositoryCashCents filters
-- `is_active = true` (internal-wallet-balance.ts), so the superseded row never contributed a balance.
-- The exposure was the categorization queue, which filtered only by entity — "across ALL accounts" —
-- so those 48 copies were listed for review and categorizing one would POST IT TO THE GL, double-
-- booking a transaction the active registration already carries. That path is closed in the same PR by
-- supersededDuplicatePredicate() in pending-categorization.ts.
--
-- THIS MIGRATION closes the door that let it happen: a partial UNIQUE index so a second ACTIVE
-- registration of the same (entity, institution, mask) cannot be created at all. Re-linking still works
-- — deactivate the old row first, which is exactly what already happened for USMCA/3224 and TRK/3500.
--
-- SCOPE / SAFETY:
--   · Partial: only ACTIVE, non-deactivated rows are constrained. Every historical/superseded row stays
--     exactly as it is — VOID-NOT-DELETE, nothing is removed or rewritten.
--   · NULL institution/mask excluded: 1 active account on prod has one of them NULL, and a manually
--     entered account without a mask is not something this index can meaningfully identify. Postgres
--     would treat those NULLs as distinct anyway; excluding them is explicit rather than accidental.
--   · Verified createable BEFORE writing: groups with more than one ACTIVE row = 0 on prod today.
--   · Non-concurrent CREATE INDEX is safe here — banking.bank_accounts holds ~12 rows.
--
-- IDEMPOTENT: `IF NOT EXISTS`; a second run is a no-op. NO DELETE. NO data rewrite.

DO $$
DECLARE
  v_violations int;
  v_detail text;
BEGIN
  -- Fail-closed and EXPLAIN, rather than letting CREATE UNIQUE INDEX fail with a bare duplicate-key
  -- error that names an index nobody has seen before.
  SELECT count(*), coalesce(string_agg(format('%s/%s (%s active rows)', institution_name, account_mask, n), '; '), '')
    INTO v_violations, v_detail
    FROM (
      SELECT institution_name, account_mask, count(*) AS n
        FROM banking.bank_accounts
       WHERE is_active = true
         AND deactivated_at IS NULL
         AND institution_name IS NOT NULL
         AND account_mask IS NOT NULL
       GROUP BY operating_company_id, institution_name, account_mask
      HAVING count(*) > 1
    ) x;

  IF v_violations <> 0 THEN
    RAISE EXCEPTION
      'BANK-F13: % real account(s) already have more than one ACTIVE registration — %. Deactivate the superseded row(s) first; this migration will not choose which one survives.',
      v_violations, v_detail;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_accounts_one_active_per_real_account
  ON banking.bank_accounts (operating_company_id, institution_name, account_mask)
  WHERE is_active = true
    AND deactivated_at IS NULL
    AND institution_name IS NOT NULL
    AND account_mask IS NOT NULL;

COMMENT ON INDEX banking.ux_bank_accounts_one_active_per_real_account IS
  'BANK-F13 (2026-07-30): one ACTIVE registration per real bank account (entity + institution + mask). A second re-link must deactivate the first. Prevents the duplicate-registration class that put 48 superseded copies of USMCA Bank of America ••3224 into the categorization queue, where posting one would have double-booked the GL.';
