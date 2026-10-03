-- OWNER ORDER 2026-10-03 — KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. Tables 2-5 (CC-1).
--
--   2  driver_finance.escrow_balances.current_balance_cents  -> 2100-00-nnn GL (balance)
--   3  driver_finance.escrow_balances.total_held_cents       -> 2100-00-nnn GL (credits = held)
--   4  driver_finance.escrow_balances.total_released_cents   -> 2100-00-nnn GL (debits = released)
--   5  driver_finance.escrow_ledger.running_balance_cents    -> 2100-00-nnn GL (THE LEDGER ROWS STAY)
--
-- Measured 2026-10-03 (prod, USMCA): 18 escrow_balances rows; the stored current balance disagreed with the GL on 10
-- drivers (purge population — repaired by nothing, it leaves with the columns). No money decision read a stored amount
-- (every cap / over-draw / release reads the GL through readDriverEscrowBalanceCents); six writers kept the copies, and
-- two of them (forfeit, separation) refused when the STORED copy was below the amount even though the GL allowed it.
-- Tables 2-5 ship together because each writer wrote the balance row and the ledger running balance in one pair.
--
-- What stays: the escrow_balances ROW (identity — escrow_ledger.escrow_balance_id points at it — plus last_settlement_id,
-- release schedule, status) and every escrow_ledger row. What replaces the amounts: driver_finance.v_escrow_balances
-- (same shape, amounts from the GL). The refusal on the stored balance retires to the two GL refusals
-- (trg_refuse_driver_escrow_gl_debit_balance, trg_driver_escrow_gl_never_negative). recompute_driver_debt reads the GL.
--
-- Idempotent: CREATE OR REPLACE VIEW / FUNCTION, DROP ... IF EXISTS.

CREATE OR REPLACE VIEW driver_finance.v_escrow_balances WITH (security_invoker = true) AS
SELECT eb.id,
       eb.operating_company_id,
       eb.driver_id,
       COALESCE(g.held_cents, 0)::bigint      AS total_held_cents,
       COALESCE(g.released_cents, 0)::bigint  AS total_released_cents,
       COALESCE(g.balance_cents, 0)::bigint   AS current_balance_cents,
       eb.last_settlement_id,
       eb.last_updated_at,
       eb.release_scheduled_at,
       eb.release_claims_window_days,
       eb.status,
       eb.created_at
  FROM driver_finance.escrow_balances eb
  LEFT JOIN (
    SELECT v.operating_company_id, v.driver_id,
           sum(v.held_cents) AS held_cents, sum(v.released_cents) AS released_cents, sum(v.balance_cents) AS balance_cents
      FROM driver_finance.v_driver_escrow_balance v
     GROUP BY v.operating_company_id, v.driver_id
  ) g ON g.operating_company_id = eb.operating_company_id AND g.driver_id = eb.driver_id;

COMMENT ON VIEW driver_finance.v_escrow_balances IS
  'KILL THE SECOND SYSTEM tables 2-4 (2026-10-03): the driver escrow summary, amounts DERIVED from the 2100-00-nnn GL (v_driver_escrow_balance). driver_finance.escrow_balances keeps only the identity row.';

GRANT SELECT ON driver_finance.v_escrow_balances TO ih35_app;
DO $grant$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON driver_finance.v_escrow_balances TO ih35_ci_readonly;
  END IF;
END $grant$;

CREATE OR REPLACE FUNCTION driver_finance.recompute_driver_debt(p_driver_id uuid)
 RETURNS TABLE(driver_id uuid, total_active_debt numeric, pending_ack_liability_count integer, pending_ack_total numeric, escrow_balance_pre_clause numeric, escrow_balance_post_clause numeric, computed_at timestamp with time zone, source_liabilities jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_total numeric(14, 2) := 0;
  v_pending_n integer := 0;
  v_pending_total numeric(14, 2) := 0;
  v_escrow_pre numeric(14, 2) := 0;
  v_escrow_post numeric(14, 2) := 0;
  v_sources jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_driver_id IS NULL THEN
    RAISE EXCEPTION 'recompute_driver_debt: driver_id required';
  END IF;

  SELECT
    COALESCE(SUM(l.current_balance) FILTER (
      WHERE l.current_balance > 0
        AND COALESCE(l.status, '') NOT IN ('paid', 'void', 'written_off', 'closed', 'forgiven')
    ), 0),
    COALESCE(COUNT(*) FILTER (
      WHERE l.requires_acknowledgment IS TRUE
        AND l.status = 'pending_ack'
    ), 0)::integer,
    COALESCE(SUM(l.current_balance) FILTER (
      WHERE l.requires_acknowledgment IS TRUE
        AND l.status = 'pending_ack'
    ), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'type', l.type,
          'status', l.status,
          'current_balance', l.current_balance,
          'requires_acknowledgment', l.requires_acknowledgment
        )
        ORDER BY l.created_at DESC
      ) FILTER (
        WHERE l.current_balance > 0
          AND COALESCE(l.status, '') NOT IN ('paid', 'void', 'written_off', 'closed', 'forgiven')
      ),
      '[]'::jsonb
    )
  INTO v_total, v_pending_n, v_pending_total, v_sources
  FROM driver_finance.driver_liabilities l
  WHERE l.driver_id = p_driver_id;

  -- KILL THE SECOND SYSTEM (2026-10-03): the escrow balance is the driver's 2100-00-nnn GL (cents → dollars), not the
  -- last ledger row's stored running balance (that column no longer exists). Pre/post clause split is not on the
  -- books — the same balance in both fields (honest; no invented split).
  SELECT COALESCE(sum(v.balance_cents), 0)::numeric / 100.0
    INTO v_escrow_pre
    FROM driver_finance.v_driver_escrow_balance v
   WHERE v.driver_id = p_driver_id;
  v_escrow_pre := COALESCE(v_escrow_pre, 0);
  v_escrow_post := v_escrow_pre;

  -- Best-effort cache write only when columns exist (prod mdata.drivers currently has none).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mdata' AND table_name = 'drivers' AND column_name = 'total_active_debt'
  ) THEN
    EXECUTE $u$
      UPDATE mdata.drivers d SET
        total_active_debt = $1,
        pending_ack_liability_count = $2,
        debt_last_recomputed_at = $3
      WHERE d.id = $4
    $u$ USING v_total, v_pending_n, v_now, p_driver_id;
  END IF;

  driver_id := p_driver_id;
  total_active_debt := v_total;
  pending_ack_liability_count := v_pending_n;
  pending_ack_total := v_pending_total;
  escrow_balance_pre_clause := v_escrow_pre;
  escrow_balance_post_clause := v_escrow_post;
  computed_at := v_now;
  source_liabilities := COALESCE(v_sources, '[]'::jsonb);
  RETURN NEXT;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_escrow_over_release ON driver_finance.escrow_balances;
DROP FUNCTION IF EXISTS driver_finance.refuse_escrow_over_release();

ALTER TABLE driver_finance.escrow_balances DROP COLUMN IF EXISTS current_balance_cents;
ALTER TABLE driver_finance.escrow_balances DROP COLUMN IF EXISTS total_held_cents;
ALTER TABLE driver_finance.escrow_balances DROP COLUMN IF EXISTS total_released_cents;
ALTER TABLE driver_finance.escrow_ledger DROP COLUMN IF EXISTS running_balance_cents;
