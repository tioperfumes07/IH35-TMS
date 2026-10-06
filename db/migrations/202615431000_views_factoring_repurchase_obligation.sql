-- 202615431000_views_factoring_repurchase_obligation.sql
-- FARO-F435 (Lead, 2026-10-06, owner order: "SO YOU BUILD THE FARO VIEWS")
--
-- views.factoring_repurchase_obligation has never existed. Three guards named it and ALL THREE
-- EXITED 0 — a fake green on factoring money — until CC-2 made them exit 2 (#25548):
--   verify-faro-default-interest-accrues-from-day-35
--   verify-faro-no-purchased-account-past-repurchase-deadline
--   verify-faro-partial-payment-leaves-account-open
-- The two migrations they cite (202613301700 / 202613301800) exist in neither db/migrations nor the
-- held list. This builds the view those guards were written against, from tables that already exist.
--
-- THE OBLIGATION UNIT IS THE PURCHASE LINE, not the purchase and not the advance. That is what
-- 202615220700 already chose for accounting.factoring_repurchase_due_events (UNIQUE per
-- purchase_line_id), and an obligation that Faro can repurchase is one invoice.
--
-- EXECUTED FARO AGREEMENT, as the guards cite it:
--   Repurchase Term 30 days + Grace Period 5 days -> Default Interest begins on DAY 35
--   Default Interest 0.067%/day, compounded
-- Day 35 is therefore purchase_date + 35 days, and it is a property of the agreement, not of a row.
--
-- WHAT IS DERIVED AND FROM WHERE — no number here is invented:
--   gross_cents            accounting.factoring_purchase_lines.gross_cents
--   paid_cents             banking.bank_transactions matched to the advance
--                          (matched_factoring_advance_id), voided excluded. This is the ONLY
--                          source of a partial payment in the schema today; there is no
--                          per-line payment application table.
--   repurchase_due_on      the due event's extended_to when the owner extended, else its due_date.
--                          A line with no due event yet is NOT past deadline — the event is what
--                          asks the owner, and 202615220700's whole point is that recourse asks
--                          rather than happens.
--   closed                 the owner's own decision on the due event
--                          ('repurchase_confirmed' / 'marked_collected'), or the purchase voided.
--
-- NO POSTING, NO AMOUNT THAT POSTS. A view cannot write; this one only reads what the engines wrote.
-- RLS (CC-2, applying): a plain view runs with its OWNER's privileges, and the owner bypasses RLS, so a plain view would
-- show every company's factoring obligations to any role that can select it. security_invoker = true makes the view
-- run as the CALLER, so the RLS on accounting.factoring_purchases / _lines / _repurchase_due_events /
-- banking.bank_transactions applies exactly as it does to the tables themselves (the repo's convention: 68 migrations).

BEGIN;

CREATE OR REPLACE VIEW views.factoring_repurchase_obligation WITH (security_invoker = true) AS
WITH line_paid AS (
  -- Partial payments reach a factoring obligation only through a matched bank line today.
  SELECT
    p.id                                   AS purchase_id,
    COALESCE(SUM(ABS(bt.amount_cents)), 0) AS purchase_paid_cents
  FROM accounting.factoring_purchases p
  LEFT JOIN banking.bank_transactions bt
         ON bt.matched_factoring_advance_id = p.factoring_advance_id
        AND bt.voided_at IS NULL
        AND bt.operating_company_id = p.operating_company_id
  GROUP BY p.id
),
base AS (
  SELECT
    pl.operating_company_id,
    pl.id                                   AS purchase_line_id,
    p.id                                    AS purchase_id,
    p.factoring_advance_id,
    pl.invoice_id,
    pl.customer_id,
    p.factoring_company_vendor_id,
    -- The obligation's human handle: the purchase document plus its line number.
    (p.display_id || '-' || pl.line_no::text) AS display_id,
    pl.faro_invoice_number,
    p.purchase_date,
    pl.gross_cents                          AS net_amount_cents,
    -- The purchase's payments apportioned to the line by its share of the gross. A purchase with a
    -- single line keeps the whole figure; the apportionment only matters on a multi-invoice purchase.
    CASE
      WHEN p.gross_cents > 0
        THEN FLOOR(lp.purchase_paid_cents::numeric * pl.gross_cents::numeric / p.gross_cents::numeric)::bigint
      ELSE 0::bigint
    END                                     AS paid_cents,
    due.state                               AS due_event_state,
    COALESCE(due.extended_to, due.due_date) AS repurchase_due_on,
    (p.purchase_date + 35)                  AS default_interest_starts_on,
    -- CC-2: the CONTRACTUAL Repurchase Deadline — Purchase Date + 95 calendar days (executed Faro agreement;
    -- docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md "Repurchase Deadline 95d (recourse)"; locked decision §8.6).
    -- It is the hard backstop where the money leaves, and it is what verify-faro-no-purchased-account-past-
    -- repurchase-deadline checks. The due event above is the owner's operational ask and is kept beside it.
    (p.purchase_date + 95)                  AS repurchase_deadline_date,
    p.status                                AS purchase_status,
    p.voided_at                             AS purchase_voided_at
  FROM accounting.factoring_purchase_lines pl
  JOIN accounting.factoring_purchases p
    ON p.id = pl.purchase_id
   AND p.operating_company_id = pl.operating_company_id
  JOIN line_paid lp
    ON lp.purchase_id = p.id
  LEFT JOIN accounting.factoring_repurchase_due_events due
    ON due.purchase_line_id = pl.id
   AND due.operating_company_id = pl.operating_company_id
  WHERE pl.voided_at IS NULL
)
SELECT
  b.operating_company_id,
  b.purchase_line_id,
  b.purchase_id,
  b.factoring_advance_id,
  b.invoice_id,
  b.customer_id,
  b.factoring_company_vendor_id,
  b.display_id,
  b.faro_invoice_number,
  b.purchase_date,
  b.repurchase_due_on,
  b.repurchase_deadline_date,
  (b.repurchase_deadline_date - CURRENT_DATE)::int AS days_to_repurchase_deadline,
  b.default_interest_starts_on,
  b.net_amount_cents,
  b.paid_cents,
  GREATEST(b.net_amount_cents - b.paid_cents, 0)::bigint AS outstanding_liability_cents,
  b.due_event_state,
  b.purchase_status,

  -- CLOSED is the owner's decision or a voided purchase. Paying in full does not close an
  -- obligation by itself: Faro's own example is that a payment is a credit, not a settlement.
  -- COALESCE, like every other flag here: with no due event, `voided_at IS NOT NULL OR state IN (...)` is
  -- `false OR NULL` = NULL, and a NULL "closed" silently drops the obligation from any `WHERE NOT closed`
  -- (caught in the rehearsal on a production copy: closed came back NULL for an open, past-deadline line).
  (b.purchase_voided_at IS NOT NULL
     OR COALESCE(b.due_event_state, 'awaiting_owner') IN ('repurchase_confirmed', 'marked_collected')) AS closed,

  (b.purchase_voided_at IS NULL
     AND COALESCE(b.due_event_state, 'awaiting_owner') NOT IN ('repurchase_confirmed', 'marked_collected')
     AND (b.net_amount_cents - b.paid_cents) > 0)                          AS is_open,

  -- REPURCHASED ACCOUNT EXAMPLE 2: a partial payment leaves the account OPEN. True when something
  -- was paid, not everything was paid, and nobody has closed it.
  (b.paid_cents > 0
     AND b.paid_cents < b.net_amount_cents
     AND b.purchase_voided_at IS NULL
     AND COALESCE(b.due_event_state, 'awaiting_owner') NOT IN ('repurchase_confirmed', 'marked_collected'))
                                                                           AS partially_paid_still_open,

  -- PAST THE OWNER'S DUE DATE (the due event's date, extended or not): still open, a due date exists, and today is
  -- past it. A line with no due event is never flagged here — the event is the thing that asks the owner.
  (b.repurchase_due_on IS NOT NULL
     AND CURRENT_DATE > b.repurchase_due_on
     AND b.purchase_voided_at IS NULL
     AND COALESCE(b.due_event_state, 'awaiting_owner') NOT IN ('repurchase_confirmed', 'marked_collected')
     AND (b.net_amount_cents - b.paid_cents) > 0)                          AS past_owner_due_date,

  -- PAST THE CONTRACTUAL REPURCHASE DEADLINE (day 95): still open with an outstanding liability. This is the
  -- agreement's hard backstop, independent of whether a due event exists.
  (CURRENT_DATE > b.repurchase_deadline_date
     AND b.purchase_voided_at IS NULL
     AND COALESCE(b.due_event_state, 'awaiting_owner') NOT IN ('repurchase_confirmed', 'marked_collected')
     AND (b.net_amount_cents - b.paid_cents) > 0)                          AS past_repurchase_deadline,

  -- ACCRUING DEFAULT INTEREST: open, outstanding, and on or past day 35.
  (CURRENT_DATE >= b.default_interest_starts_on
     AND b.purchase_voided_at IS NULL
     AND COALESCE(b.due_event_state, 'awaiting_owner') NOT IN ('repurchase_confirmed', 'marked_collected')
     AND (b.net_amount_cents - b.paid_cents) > 0)                          AS accruing_default_interest,

  -- What default interest has been RECORDED against this obligation's advance and not yet paid.
  -- Sourced only from the accrual engine's own active rows; this view never computes interest.
  COALESCE((
    SELECT SUM(a.interest_cents)
      FROM accounting.factoring_default_interest_accruals a
     WHERE a.factoring_advance_id = b.factoring_advance_id
       AND a.operating_company_id = b.operating_company_id
       AND a.is_active
       AND a.accrual_date >= b.default_interest_starts_on
  ), 0)::bigint                                                            AS default_interest_unpaid_cents,

  -- REPURCHASE PRICE (executed agreement): Net Amount + unpaid Transaction Fees + Default Interest - credits.
  -- Credits are the payments already applied (paid_cents), so outstanding + recorded unpaid default interest.
  -- Unpaid Transaction Fees are NOT included: no table records them per purchase today (the spec notes only a
  -- wire-fee role exists). When one does, it joins here; until then this figure is stated without them.
  (GREATEST(b.net_amount_cents - b.paid_cents, 0) + COALESCE((
    SELECT SUM(a.interest_cents)
      FROM accounting.factoring_default_interest_accruals a
     WHERE a.factoring_advance_id = b.factoring_advance_id
       AND a.operating_company_id = b.operating_company_id
       AND a.is_active
       AND a.accrual_date >= b.default_interest_starts_on
  ), 0))::bigint                                                           AS repurchase_price_cents
FROM base b;

COMMENT ON VIEW views.factoring_repurchase_obligation IS
  'FARO-F435: one row per open factoring purchase LINE. Day-35 default interest (30-day Repurchase '
  'Term + 5-day Grace), the repurchase deadline from the owner-decision due event, and partial-payment-'
  'leaves-it-open. Derived only; writes nothing and computes no interest of its own.';

GRANT SELECT ON views.factoring_repurchase_obligation TO ih35_app;

COMMIT;
