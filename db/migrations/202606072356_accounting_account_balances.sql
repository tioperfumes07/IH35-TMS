-- BLOCK 10/44 — Account Balances View (ledger-backed per account / per period)
-- Migration: 202606072356
-- Creates accounting.fn_account_balances_as_of(p_company_id, p_as_of_date, p_from_date)
-- Building block for BLOCK 13 (Balance Sheet) and BLOCK 14 (Cash Flow).

BEGIN;

-- Defensive: ensure ih35_app can use the accounting schema.
GRANT USAGE ON SCHEMA accounting TO ih35_app;

-- ---------------------------------------------------------------------------
-- Function: accounting.fn_account_balances_as_of
-- ---------------------------------------------------------------------------
-- Returns one row per account that has any posting activity through
-- p_as_of_date (or prior to p_from_date if that is provided).
--
-- Columns:
--   opening_balance_cents  — cumulative net (debits − credits) through the day
--                            BEFORE p_from_date.  NULL when p_from_date is NULL.
--   period_debits_cents    — gross debits in [p_from_date, p_as_of_date].
--                            When p_from_date is NULL the window is [inception, p_as_of_date].
--   period_credits_cents   — gross credits in the same window.
--   period_activity_cents  — net (debits − credits) in the same window.
--   closing_balance_cents  — cumulative net (debits − credits) through p_as_of_date.
--                            Always equals opening_balance_cents + period_activity_cents
--                            when p_from_date is non-NULL.
--
-- Filters applied (mirrors trial-balance.service.ts):
--   • je.status <> 'voided'
--   • posting_batch_id IS NULL  OR  pb.batch_status IN ('posted', 'reversed')
--
-- RLS note: caller MUST have already set:
--   SET LOCAL app.operating_company_id = '<uuid>';
-- The WHERE clause enforces company scope at the row level.
-- SECURITY INVOKER ensures the function runs as the calling role, honouring RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION accounting.fn_account_balances_as_of(
  p_company_id  uuid,
  p_as_of_date  date,
  p_from_date   date DEFAULT NULL
)
RETURNS TABLE (
  account_id              uuid,
  account_code            text,
  account_name            text,
  account_type            text,
  normal_balance          text,
  opening_balance_cents   bigint,
  period_debits_cents     bigint,
  period_credits_cents    bigint,
  period_activity_cents   bigint,
  closing_balance_cents   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
    AND je.status <> 'voided'
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
$$;

GRANT EXECUTE ON FUNCTION accounting.fn_account_balances_as_of(uuid, date, date) TO ih35_app;

COMMIT;
