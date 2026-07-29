-- OB-01 — OWNER RULING 2026-07-29: auto-IMPORT + COMMIT the TRANSP QBO snapshot AS-OF 03/31/2026
-- clone-as-is NOW (Adjustment 0), so the books are populated and the software is functional
-- immediately. This is the deploy-pipeline mechanism the ruling asks for ("Prefer generating the SQL
-- VALUES from the JSON fixture so deploy pipeline applies balances without a separate node step") —
-- the (account, snapshot_cents) pairs below are generated verbatim from
-- docs/fixtures/ob01/transp-2026-03-31.json (itself transcribed from
-- docs/fixtures/ob01/Cursor-Balances-Reference.xlsx, the owner-provided QBO Balance Sheet pull,
-- accrual basis, pulled 2026-07-28 16:48 CDT). Regenerate together with the fixture and the matching
-- rule below if the source ever changes — never hand-edit one without the others.
--
-- TRANSP ONLY. TRK stays untouched (worksheet tab is "AWAITING DATA" — a separate QBO company not yet
-- connected; inventing TRK balances is forbidden). USMCA stays untouched (manual entry only, no QBO
-- realm — owner ruling stands unchanged). This migration does not touch either.
--
-- MATCHING (2026-07-29 prod-truth pass against live Neon catalogs.accounts, unmasked — updated from
-- this migration's original two-step rule after confirming the exact live spellings): for each fixture
-- line, try (a) exact catalogs.accounts.account_name match, (b) case-insensitive/trimmed
-- (lower(btrim(...))) match, and — for the two labels below where prod truth showed the fixture's own
-- label is a QBO-report-only spelling — (c) the SAME two comparisons against a documented `match_alias`
-- literal instead of the fixture's own label:
--   - "Accounts Receivable (A/R) [control]" -> "Accounts Receivable (A/R)" (QBO's Balance Sheet report
--     appends "[control]" to the A/R control account; the live CoA row never carries it)
--   - "Unauthorized Expenses Ignacio Munoz" -> "Unauthorized Expenses Ignacio Muñoz" (ASCII
--     transliteration in the worksheet vs the live CoA's accented spelling)
-- This is the identical alias rule opening-balance-register.service.ts implements in
-- resolveFixtureAccountMatch (plus a general control-suffix-strip and diacritic-fold pass as an
-- additional safety net beyond these two documented aliases) — the register and this migration agree
-- on what "the same account" means. Any fixture line that STILL does not match a live, non-deactivated
-- TRANSP account is skipped with a NOTICE naming it — never invented, never guessed, never RAISEd (a
-- RAISE here would fail the whole migration over one unmapped label). On the live prod TRANSP CoA, 0 of
-- the 57 fixture lines are expected to NOTICE-skip after this alias pass (verified against an unmasked
-- Neon read 2026-07-29); a NOTICE on prod after this migration ships means the CoA has since changed
-- and is worth investigating, not an expected/ignorable outcome anymore.
--
-- NET INCOME FOLD (owner-directed, 2026-07-29): "Net Income" is QBO's Balance Sheet report computing a
-- rollup of not-yet-closed P&L accounts — it is NOT itself a postable catalogs.accounts row in ANY
-- chart of accounts, QBO's or this one, so it is never attempted as a name match. Per owner instruction
-- its current-year-to-date amount at the 03/31/2026 cutover is folded into Retained Earnings instead of
-- invented as its own account: -106348665 (Net Income) + -861000742 (Retained Earnings, its own fixture
-- line) = -967349407, which is EXACTLY the fixture's declared acceptance equity total — proof this
-- fold reproduces the intended consolidated Equity, not a guessed number. The fold is applied as an
-- explicit second UPDATE after the main loop below (not baked into the Retained Earnings literal) so
-- the NOTICE trail shows the fold happening, and the amount can be traced back to the fixture's own
-- "Net Income" line.
--
-- WHAT THIS WRITES: for each matched account, sets opening_balance_qbo_snapshot_cents = snapshot,
-- opening_balance_adjustment_cents = 0, opening_balance_cents = snapshot (Adjusted Opening = Snapshot
-- + 0 = Snapshot, per the clone-as-is-then-adjust ruling), opening_balance_as_of = 2026-03-31, and then
-- separately adds the Net Income fold onto Retained Earnings's already-set values. Pure UPDATE — no
-- INSERT, no DELETE, no new rows, no account created. Re-running is idempotent: it always sets the same
-- 4 columns to the same computed values, including the Net Income fold (it does NOT try to "preserve an
-- adjustment" across a migration re-run the way the live register does on re-import; a migration is not
-- the place to read-modify-write around a value the owner may have edited in the app afterward — if
-- someone has since adjusted a balance in the live register, DO NOT re-run this file against that
-- environment expecting it to respect that edit. It won't; it always seeds Adjustment 0 to match its
-- own contract).
--
-- Deliberately NOT done here (documented, not silently skipped): inserting a matching
-- accounting.ob_register_staging_lines row marked 'committed', and its accounting.ob_register_audit_events
-- WORM row, so the register's own history shows this seed as an import+commit event. That trail
-- requires an actor_user_id (a real identity.users row acting as maker=checker for a system action),
-- which a migration has no authority to fabricate. The equivalent, reviewable trail is produced by
-- calling POST /api/v1/accounting/opening-balance-register/clone-as-is-commit once after this
-- migration lands (cloneAsIsImportAndCommit — it re-derives from the exact same fixture file (aliases
-- and fold included), is idempotent, and writes the full staged+committed+audited trail with a real
-- actor). This migration's job is solely "the columns are populated on prod immediately", per the
-- owner ruling.
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
  ni_fold_cents CONSTANT bigint := -106348665;
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

  -- account_name, qbo_snapshot_cents, match_alias (NULL unless the fixture label is a QBO-report-only
  -- spelling that prod truth showed differs from the live CoA row — see MATCHING note above). "Net
  -- Income" is deliberately NOT a row here — it has no catalogs.accounts row in any chart of accounts;
  -- its amount is folded into Retained Earnings explicitly, below, after this loop.
  FOR v IN
    SELECT * FROM (VALUES
    ('BOA-CHECKING-1135', 14775316::bigint, NULL::text),
    ('BOA-SAVINGS-1148', -12403407::bigint, NULL::text),
    ('Cash on hand', 0::bigint, NULL::text),
    ('Comdata-Prepay Express Code Account', -24666563::bigint, NULL::text),
    ('Factoring Reserves Love''s Solutions', 1299499::bigint, NULL::text),
    ('Faro Factoring Reserves', -19263181::bigint, NULL::text),
    ('IBC-5231', 34761328::bigint, NULL::text),
    ('IBC-AHORROS-6089', -43869143::bigint, NULL::text),
    ('Petty Cash', 400000::bigint, NULL::text),
    ('PNC-2786', 152337::bigint, NULL::text),
    ('PNC-2954', 154796553::bigint, NULL::text),
    ('PNC-2962', -48102::bigint, NULL::text),
    ('Relay-Diesel Bank Account', 515396::bigint, NULL::text),
    ('RTS-Factoring Reserves', -44602701::bigint, NULL::text),
    ('Transportation/Trucking Loan Account', -1400000::bigint, NULL::text),
    ('VANTAGE-6071', 0::bigint, NULL::text),
    ('VANTAGE-6107', -81531::bigint, NULL::text),
    ('VANTAGE-6224', 1586975::bigint, NULL::text),
    ('WF - General Operating 6103', 954315::bigint, NULL::text),
    ('WF - Payroll 6129', -75377::bigint, NULL::text),
    ('WF - Savings 6137', -2350126::bigint, NULL::text),
    ('Accounts Receivable (A/R) [control]', -93408200::bigint, 'Accounts Receivable (A/R)'),
    ('Unauthorized Expenses Anarely Alcazar', 7025348::bigint, NULL::text),
    ('Unauthorized Expenses Ignacio Munoz', 33675138::bigint, 'Unauthorized Expenses Ignacio Muñoz'),
    ('Driver Cash Advance', 114516::bigint, NULL::text),
    ('eCapital', 49720::bigint, NULL::text),
    ('Loans to Others/IH 35 Trucking', -14642214::bigint, NULL::text),
    ('LOVES SOLUTIONS,LLC', -579344::bigint, NULL::text),
    ('QuickBooks Tax Holding Account', 165006::bigint, NULL::text),
    ('RTS FINANCIAL-VIRTUAL ACCT', -827002028::bigint, NULL::text),
    ('Uncategorized Asset', 6732::bigint, NULL::text),
    ('Accounts Payable (A/P)', 78221377::bigint, NULL::text),
    ('Capital One-Scentsx', -1325000::bigint, NULL::text),
    ('Amex Card-', 6681476::bigint, NULL::text),
    ('Citi-Executive Card', 189774::bigint, NULL::text),
    ('Comdata-Driven Fuel Card', -11249556::bigint, NULL::text),
    ('Discover Card-4451', 2673321::bigint, NULL::text),
    ('Capital Partners-Cash Advane', 9680000::bigint, NULL::text),
    ('Faro Loan', -2327521::bigint, NULL::text),
    ('Loan-Scentsx', 61737725::bigint, NULL::text),
    ('Owner Loan-Acct-4019', 8074876::bigint, NULL::text),
    ('Owner Loan-Acct-9745', -19072598::bigint, NULL::text),
    ('RTS-Loans', 0::bigint, NULL::text),
    ('RTS - NEWCO LOAN', 0::bigint, NULL::text),
    ('Direct Deposit Payable', 0::bigint, NULL::text),
    ('Direct Deposit Payable ( 353 )', 0::bigint, NULL::text),
    ('Federal Taxes (941/943/944)', -319246::bigint, NULL::text),
    ('Federal Unemployment (940)', 16325::bigint, NULL::text),
    ('TX Unemployment Tax', 91303::bigint, NULL::text),
    ('Sent Payments to trucking', -5020::bigint, NULL::text),
    ('2025-Damage Claim Escrow', 451884::bigint, NULL::text),
    ('2026-Damage Claim Escrow', 581000::bigint, NULL::text),
    ('EXPRESS CODE', 4000::bigint, NULL::text),
    ('Independence Bank-Credit Line', -868451::bigint, NULL::text),
    ('Opening Balance Equity', 0::bigint, NULL::text),
    ('Retained Earnings', -861000742::bigint, NULL::text)
    ) AS t(account_name, qbo_snapshot_cents, match_alias)
  LOOP
    UPDATE catalogs.accounts
       SET opening_balance_qbo_snapshot_cents = v.qbo_snapshot_cents,
           opening_balance_adjustment_cents = 0,
           opening_balance_cents = v.qbo_snapshot_cents,
           opening_balance_as_of = DATE '2026-03-31'
     WHERE operating_company_id = transp_id
       AND deactivated_at IS NULL
       AND (
         account_name = v.account_name
         OR lower(btrim(account_name)) = lower(btrim(v.account_name))
         OR (
           v.match_alias IS NOT NULL
           AND (account_name = v.match_alias OR lower(btrim(account_name)) = lower(btrim(v.match_alias)))
         )
       );

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    IF rows_affected = 0 THEN
      RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: no live TRANSP account matched % (alias tried: %) — skipped (never invented)', v.account_name, coalesce(v.match_alias, 'none');
      skipped_count := skipped_count + 1;
    ELSE
      updated_count := updated_count + rows_affected;
    END IF;
  END LOOP;

  -- Net Income fold-into Retained Earnings — see NET INCOME FOLD note above. Applied AFTER the main
  -- loop, as its own UPDATE, so it is visible in the NOTICE trail and traceable to the exact fixture
  -- amount rather than baked silently into the Retained Earnings literal above.
  UPDATE catalogs.accounts
     SET opening_balance_qbo_snapshot_cents = coalesce(opening_balance_qbo_snapshot_cents, 0) + ni_fold_cents,
         opening_balance_cents = coalesce(opening_balance_cents, 0) + ni_fold_cents,
         opening_balance_adjustment_cents = 0
   WHERE operating_company_id = transp_id
     AND deactivated_at IS NULL
     AND account_type = 'Equity'
     AND (account_name = 'Retained Earnings' OR lower(btrim(account_name)) = 'retained earnings');

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected = 0 THEN
    RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: Net Income fold target "Retained Earnings" not matched — Net Income (% cents) NOT folded; equity will not tie to the fixture''s acceptance total until this is resolved', ni_fold_cents;
    skipped_count := skipped_count + 1;
  ELSE
    RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: folded Net Income (% cents) into Retained Earnings (% row(s))', ni_fold_cents, rows_affected;
  END IF;

  RAISE NOTICE 'OB-01 TRANSP clone-as-is seed: updated % account row(s) (incl. Net Income fold), skipped % fixture line(s) of 57, as of 2026-03-31', updated_count, skipped_count;
END
$$;

COMMIT;

-- Read-only verify (harmless on re-run): how many TRANSP accounts now carry the 03/31/2026 snapshot,
-- and the live sum by account type (informational only — the fixture's own acceptance totals are
-- proved independently by scripts/verify-ob01-fixture-tieout.mjs against the JSON, not against this
-- migration's live effect, since an unmatched CoA rename on some future prod state could still make
-- this migration's live sum diverge from the fixture even though the fixture itself ties out).
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
