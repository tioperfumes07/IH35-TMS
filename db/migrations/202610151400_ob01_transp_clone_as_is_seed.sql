-- OB-01 — OWNER RULING 2026-07-29: auto-IMPORT + COMMIT the TRANSP QBO snapshot AS-OF 03/31/2026
-- clone-as-is NOW (Adjustment 0), so the books are populated and the software is functional
-- immediately. This is the deploy-pipeline mechanism the ruling asks for ("Prefer generating the SQL
-- VALUES from the JSON fixture so deploy pipeline applies balances without a separate node step") —
-- the 57 (account, snapshot_cents) pairs below are generated verbatim from
-- docs/fixtures/ob01/transp-2026-03-31.json (itself transcribed from
-- docs/fixtures/ob01/Cursor-Balances-Reference.xlsx, the owner-provided QBO Balance Sheet pull,
-- accrual basis, pulled 2026-07-28 16:48 CDT). Regenerate both together if the source ever changes —
-- never hand-edit one without the other.
--
-- TRANSP ONLY. TRK stays untouched (worksheet tab is "AWAITING DATA" — a separate QBO company not yet
-- connected; inventing TRK balances is forbidden). USMCA stays untouched (manual entry only, no QBO
-- realm — owner ruling stands unchanged). This migration does not touch either.
--
-- MATCHING: exact catalogs.accounts.account_name match first, then case-insensitive/trimmed
-- (lower(btrim(...))) — the same two-step rule opening-balance-register.service.ts uses for the
-- register's own fixture import (importObRegisterFromFixture), so the register and this migration
-- agree on what "the same account" means. Any fixture line that does not match a live, non-deactivated
-- TRANSP account is skipped with a NOTICE naming it — never invented, never guessed, never RAISEd (a
-- RAISE here would fail the whole migration over one unmapped label). On prod, 3 of the 57 lines are
-- expected to NOTICE-skip for this reason and stay as future manual/owner work in the register:
--   - "Accounts Receivable (A/R) [control]" — QBO's report-only "[control]" suffix does not appear on
--     the live CoA row (named plain "Accounts Receivable (A/R)"); exact/ilike match intentionally does
--     not paper over that with a guessed alias.
--   - "Unauthorized Expenses Ignacio Munoz" — the live CoA row carries the accented spelling
--     ("Muñoz"); ASCII transliteration in the worksheet does not match case-insensitive-trim either.
--   - "Net Income" — QBO's balance-sheet report computes this as a rollup of not-yet-closed P&L
--     accounts; it is not itself a postable catalogs.accounts row in ANY chart of accounts, QBO's or
--     this one. Folding it into Retained Earnings would be a real accounting judgment (how much of
--     current-FY earnings becomes part of opening Retained Earnings at the 03/31/2026 cutover), not a
--     name-matching exercise — that decision is Martin/owner's to make in the register's Adjustment
--     column, not this migration's to invent.
-- These 3 gaps are why a REGISTER commit (opening-balance-register.service.ts commitObRegister) of the
-- same fixture will legitimately refuse with `unbalanced` until they are resolved — this migration is
-- the direct population path the owner asked for; the register/commit API is the reviewable path for
-- everything after.
--
-- WHAT THIS WRITES: for each matched account, sets opening_balance_qbo_snapshot_cents = snapshot,
-- opening_balance_adjustment_cents = 0, opening_balance_cents = snapshot (Adjusted Opening = Snapshot
-- + 0 = Snapshot, per the clone-as-is-then-adjust ruling), opening_balance_as_of = 2026-03-31. Pure
-- UPDATE — no INSERT, no DELETE, no new rows, no account created. Re-running is idempotent: it always
-- sets the same 4 columns to the same computed values (it does NOT try to "preserve an adjustment"
-- across a migration re-run the way the live register does on re-import; a migration is not the place
-- to read-modify-write around a value the owner may have edited in the app afterward — if someone
-- has since adjusted a balance in the live register, DO NOT re-run this file against that environment
-- expecting it to respect that edit. It won't; it always seeds Adjustment 0 to match its own contract).
--
-- Deliberately NOT done here (documented, not silently skipped): inserting a matching
-- accounting.ob_register_staging_lines row marked 'committed', and its accounting.ob_register_audit_events
-- WORM row, so the register's own history shows this seed as an import+commit event. That trail
-- requires an actor_user_id (a real identity.users row acting as maker=checker for a system action),
-- which a migration has no authority to fabricate. The equivalent, reviewable trail is produced by
-- calling POST /api/v1/accounting/opening-balance-register/clone-as-is-commit once after this
-- migration lands (cloneAsIsImportAndCommit — it re-derives from the exact same fixture file, is
-- idempotent, and writes the full staged+committed+audited trail with a real actor). This migration's
-- job is solely "the columns are populated on prod immediately", per the owner ruling.
--
-- Idempotent (IF NOT EXISTS guards on prerequisites), NOTICE + RETURN/CONTINUE, never RAISE. Company
-- resolved by CODE ('TRANSP'), never a hardcoded UUID. No DELETE, no DROP — additive UPDATE only.

BEGIN;

DO $$
DECLARE
  transp_id uuid;
  v RECORD;
  rows_affected integer;
  updated_count integer := 0;
  skipped_count integer := 0;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('org.companies') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'catalogs' AND table_name = 'accounts'
         AND column_name = 'opening_balance_qbo_snapshot_cents'
     ) THEN
    RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: prerequisites absent (accounts table or snapshot column) — skip';
    RETURN;
  END IF;

  SELECT id INTO transp_id FROM org.companies WHERE code = 'TRANSP' AND deactivated_at IS NULL LIMIT 1;
  IF transp_id IS NULL THEN
    RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: no active TRANSP company row — skip (fresh DB / not seeded yet)';
    RETURN;
  END IF;

  FOR v IN
    SELECT * FROM (VALUES
    ('BOA-CHECKING-1135', 14775316::bigint),
    ('BOA-SAVINGS-1148', -12403407::bigint),
    ('Cash on hand', 0::bigint),
    ('Comdata-Prepay Express Code Account', -24666563::bigint),
    ('Factoring Reserves Love''s Solutions', 1299499::bigint),
    ('Faro Factoring Reserves', -19263181::bigint),
    ('IBC-5231', 34761328::bigint),
    ('IBC-AHORROS-6089', -43869143::bigint),
    ('Petty Cash', 400000::bigint),
    ('PNC-2786', 152337::bigint),
    ('PNC-2954', 154796553::bigint),
    ('PNC-2962', -48102::bigint),
    ('Relay-Diesel Bank Account', 515396::bigint),
    ('RTS-Factoring Reserves', -44602701::bigint),
    ('Transportation/Trucking Loan Account', -1400000::bigint),
    ('VANTAGE-6071', 0::bigint),
    ('VANTAGE-6107', -81531::bigint),
    ('VANTAGE-6224', 1586975::bigint),
    ('WF - General Operating 6103', 954315::bigint),
    ('WF - Payroll 6129', -75377::bigint),
    ('WF - Savings 6137', -2350126::bigint),
    ('Accounts Receivable (A/R) [control]', -93408200::bigint),
    ('Unauthorized Expenses Anarely Alcazar', 7025348::bigint),
    ('Unauthorized Expenses Ignacio Munoz', 33675138::bigint),
    ('Driver Cash Advance', 114516::bigint),
    ('eCapital', 49720::bigint),
    ('Loans to Others/IH 35 Trucking', -14642214::bigint),
    ('LOVES SOLUTIONS,LLC', -579344::bigint),
    ('QuickBooks Tax Holding Account', 165006::bigint),
    ('RTS FINANCIAL-VIRTUAL ACCT', -827002028::bigint),
    ('Uncategorized Asset', 6732::bigint),
    ('Accounts Payable (A/P)', 78221377::bigint),
    ('Capital One-Scentsx', -1325000::bigint),
    ('Amex Card-', 6681476::bigint),
    ('Citi-Executive Card', 189774::bigint),
    ('Comdata-Driven Fuel Card', -11249556::bigint),
    ('Discover Card-4451', 2673321::bigint),
    ('Capital Partners-Cash Advane', 9680000::bigint),
    ('Faro Loan', -2327521::bigint),
    ('Loan-Scentsx', 61737725::bigint),
    ('Owner Loan-Acct-4019', 8074876::bigint),
    ('Owner Loan-Acct-9745', -19072598::bigint),
    ('RTS-Loans', 0::bigint),
    ('RTS - NEWCO LOAN', 0::bigint),
    ('Direct Deposit Payable', 0::bigint),
    ('Direct Deposit Payable ( 353 )', 0::bigint),
    ('Federal Taxes (941/943/944)', -319246::bigint),
    ('Federal Unemployment (940)', 16325::bigint),
    ('TX Unemployment Tax', 91303::bigint),
    ('Sent Payments to trucking', -5020::bigint),
    ('2025-Damage Claim Escrow', 451884::bigint),
    ('2026-Damage Claim Escrow', 581000::bigint),
    ('EXPRESS CODE', 4000::bigint),
    ('Independence Bank-Credit Line', -868451::bigint),
    ('Opening Balance Equity', 0::bigint),
    ('Retained Earnings', -861000742::bigint),
    ('Net Income', -106348665::bigint)
    ) AS t(account_name, qbo_snapshot_cents)
  LOOP
    UPDATE catalogs.accounts
       SET opening_balance_qbo_snapshot_cents = v.qbo_snapshot_cents,
           opening_balance_adjustment_cents = 0,
           opening_balance_cents = v.qbo_snapshot_cents,
           opening_balance_as_of = DATE '2026-03-31'
     WHERE operating_company_id = transp_id
       AND deactivated_at IS NULL
       AND (account_name = v.account_name OR lower(btrim(account_name)) = lower(btrim(v.account_name)));

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    IF rows_affected = 0 THEN
      RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: no live TRANSP account matched % — skipped (never invented)', v.account_name;
      skipped_count := skipped_count + 1;
    ELSE
      updated_count := updated_count + rows_affected;
    END IF;
  END LOOP;

  RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: updated % account row(s), skipped % fixture line(s) of 57, as of 2026-03-31', updated_count, skipped_count;
END
$$;

COMMIT;

-- Read-only verify (harmless on re-run): how many TRANSP accounts now carry the 03/31/2026 snapshot,
-- and the live sum by account type (informational only — the fixture's own acceptance totals are
-- proved independently by scripts/verify-ob01-fixture-tieout.mjs against the JSON, not against this
-- migration's live effect, since a handful of lines are expected to be unmatched per the header above).
SELECT a.account_type,
       count(*) AS accounts_with_snapshot,
       sum(a.opening_balance_cents) AS sum_opening_balance_cents
FROM catalogs.accounts a
JOIN org.companies c ON c.id = a.operating_company_id AND c.code = 'TRANSP'
WHERE a.opening_balance_as_of = DATE '2026-03-31'
  AND a.opening_balance_qbo_snapshot_cents IS NOT NULL
GROUP BY a.account_type
ORDER BY a.account_type;

-- DOWN
-- Not reversible by a mechanical DOWN: this UPDATE cannot distinguish "this migration set it" from "a
-- later live adjustment changed it" (balances are LIVE and CHANGE by design, per the owner ruling — no
-- version history is kept in catalogs.accounts itself, only in accounting.ob_register_audit_events for
-- rows that went through the register). Reverting to pre-seed ($0 / NULL as-of) is an owner-authorized
-- forward migration if ever needed, not a blind UPDATE ... SET NULL here.
