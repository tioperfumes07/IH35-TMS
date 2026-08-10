-- FINDING: SETL-FINALIZE-RECOMPUTE-DEBT
-- Live: settlement list/finalize paths 25P02 because driver_finance.recompute_driver_debt(uuid)
-- never existed on Neon (no prior migration). debt-summary returns 501.
-- Blueprint Part 4.5.4 / MUST 4.2.2.7 — synchronous recompute for transactional paths.
-- Idempotent CREATE OR REPLACE. Does NOT invent liability amounts — aggregates live rows.
-- Cache columns on mdata.drivers are optional (absent on prod today); function returns
-- live aggregates regardless. No TMS→QBO. USMCA/TRANSP entity-scoped via caller GUC.

BEGIN;

CREATE OR REPLACE FUNCTION driver_finance.recompute_driver_debt(p_driver_id uuid)
RETURNS TABLE (
  driver_id uuid,
  total_active_debt numeric,
  pending_ack_liability_count integer,
  pending_ack_total numeric,
  escrow_balance_pre_clause numeric,
  escrow_balance_post_clause numeric,
  computed_at timestamptz,
  source_liabilities jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
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

  -- Latest escrow running balance (cents → dollars). Pre/post clause split not on ledger
  -- today — return same balance in both fields (honest; no invented split).
  IF to_regclass('driver_finance.escrow_ledger') IS NOT NULL THEN
    SELECT COALESCE(e.running_balance_cents, 0)::numeric / 100.0
    INTO v_escrow_pre
    FROM driver_finance.escrow_ledger e
    WHERE e.driver_id = p_driver_id
    ORDER BY e.created_at DESC NULLS LAST
    LIMIT 1;
    v_escrow_pre := COALESCE(v_escrow_pre, 0);
    v_escrow_post := v_escrow_pre;
  END IF;

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
$fn$;

COMMENT ON FUNCTION driver_finance.recompute_driver_debt(uuid) IS
  'SETL-FINALIZE-RECOMPUTE-DEBT: live liability/escrow aggregate for transactional debt authority (Part 4.5.4).';

REVOKE ALL ON FUNCTION driver_finance.recompute_driver_debt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION driver_finance.recompute_driver_debt(uuid) TO ih35_app;

COMMIT;
