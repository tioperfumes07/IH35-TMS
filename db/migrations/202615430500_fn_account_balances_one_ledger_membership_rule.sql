-- 202615430500_fn_account_balances_one_ledger_membership_rule.sql
-- CC-2 · ACCT-F2026100601 — accounting.fn_account_balances_as_of adopts THE ONE ledger-membership rule.
--
-- WHY. Which postings make up the books was hand-typed in ~15 readers and they did not agree. The trial balance,
-- balance sheet, P&L (accrual and cash) and cash flow leave out sample-data entries (COALESCE(je.is_sample_data,
-- false) = false); this function — behind account balances and the Reclassify account panes — did not. The same
-- ledger showed one balance on Reclassify and another on the statements. The rule now lives in ONE place in code,
-- apps/backend/src/accounting/ledger-membership.ts (ledgerPostingCountsSql), and every TypeScript reader imports it.
-- This function cannot import TypeScript, so it carries the same three clauses verbatim and
-- scripts/verify-one-ledger-membership-rule.mjs checks its live definition holds all three.
--
-- WHAT CHANGES. One clause is added to the WHERE: AND COALESCE(je.is_sample_data, false) = false. Every other line is
-- the production definition read with pg_get_functiondef on 2026-10-06, unchanged: same signature, same columns, same
-- SECURITY INVOKER (honours RLS), same grant. CREATE OR REPLACE with an identical signature and return type keeps
-- every dependent object valid.
--
-- IDEMPOTENT: CREATE OR REPLACE; re-running yields the same definition. No data is written. No FORCE RLS change.

CREATE OR REPLACE FUNCTION accounting.fn_account_balances_as_of(p_company_id uuid, p_as_of_date date, p_from_date date DEFAULT NULL::date)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, normal_balance text, opening_balance_cents bigint, period_debits_cents bigint, period_credits_cents bigint, period_activity_cents bigint, closing_balance_cents bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
AS $function$
  SELECT
    p.account_id,
    COALESCE(a.account_number, '')  AS account_code,
    COALESCE(a.account_name,   '')  AS account_name,
    COALESCE(a.account_type,   '')  AS account_type,
    CASE
      WHEN COALESCE(a.account_type, '') IN ('Asset', 'CostOfGoodsSold', 'Expense', 'OtherExpense')
        THEN 'debit'
      ELSE 'credit'
    END AS normal_balance,

    -- opening: cumulative net through (p_from_date − 1 day); NULL when no p_from_date.
    CASE
      WHEN p_from_date IS NULL THEN NULL
      ELSE COALESCE(
        SUM(
          CASE
            WHEN je.entry_date < p_from_date
              THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
            ELSE 0
          END
        ), 0
      )
    END::bigint AS opening_balance_cents,

    -- period debits: window [p_from_date, p_as_of_date] or [inception, p_as_of_date].
    COALESCE(
      SUM(
        CASE
          WHEN p.debit_or_credit = 'debit'
            AND je.entry_date <= p_as_of_date
            AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
          THEN p.amount_cents
          ELSE 0
        END
      ), 0
    )::bigint AS period_debits_cents,

    -- period credits: same window.
    COALESCE(
      SUM(
        CASE
          WHEN p.debit_or_credit = 'credit'
            AND je.entry_date <= p_as_of_date
            AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
          THEN p.amount_cents
          ELSE 0
        END
      ), 0
    )::bigint AS period_credits_cents,

    -- period_activity: net in window.
    COALESCE(
      SUM(
        CASE
          WHEN je.entry_date <= p_as_of_date
            AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
          THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
          ELSE 0
        END
      ), 0
    )::bigint AS period_activity_cents,

    -- closing: cumulative net through p_as_of_date (all time, ignoring p_from_date).
    COALESCE(
      SUM(
        CASE
          WHEN je.entry_date <= p_as_of_date
          THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
          ELSE 0
        END
      ), 0
    )::bigint AS closing_balance_cents

  FROM accounting.journal_entry_postings p

  JOIN accounting.journal_entries je
    ON  je.id                   = p.journal_entry_uuid
    AND je.operating_company_id = p.operating_company_id

  LEFT JOIN accounting.posting_batches pb
    ON  pb.id                   = p.posting_batch_id
    AND pb.operating_company_id = p.operating_company_id

  LEFT JOIN catalogs.accounts a
    ON a.id = p.account_id

  WHERE p.operating_company_id = p_company_id
    -- THE ONE ledger-membership rule (apps/backend/src/accounting/ledger-membership.ts), all three clauses:
    AND je.status <> 'voided'
    AND COALESCE(je.is_sample_data, false) = false
    AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))

  GROUP BY p.account_id, a.account_number, a.account_name, a.account_type

  -- Exclude accounts with no balance and no period activity (e.g. future-dated postings only).
  HAVING
    -- Non-zero closing balance
    COALESCE(
      SUM(
        CASE
          WHEN je.entry_date <= p_as_of_date
          THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
          ELSE 0
        END
      ), 0
    ) <> 0
    OR
    -- Non-zero opening balance (relevant when p_from_date is provided)
    (
      p_from_date IS NOT NULL
      AND COALESCE(
        SUM(
          CASE
            WHEN je.entry_date < p_from_date
              THEN CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
            ELSE 0
          END
        ), 0
      ) <> 0
    )

  ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC NULLS LAST
$function$;

GRANT EXECUTE ON FUNCTION accounting.fn_account_balances_as_of(uuid, date, date) TO ih35_app;
