-- ROUND 394 RULING 1, step 2a (CC-1) — a driver advance's balance is DERIVED from the general ledger.
--
-- driver_finance.v_driver_advance_balances: per advance, what it put on the driver's OWN 1245 sub-account
-- (its driver_advance disbursement line plus any reversal of that line), what of it has been recovered, and
-- what is outstanding. The driver's own sub-account is the bridge row (driver_finance.driver_advance_accounts)
-- whose account is a child of the account bound to the advance_recovery role (365.1: by role, never number).
-- Every other movement on that sub-account (pay-run close credits, A/P-chain applications) is a recovery,
-- applied oldest-first — the same order the pay-run recovers in. A reversed or undisbursed advance owes $0.
--
-- Readers move to it here: recompute_driver_debt (the dispatch debt warning), views.banking_account_tiles
-- (the Cash Advance Pool tile) and views.cash_advances_with_context (the cash-advance tabs) stop reading driver_advances.outstanding_balance / an advance liability's
-- current_balance. The column is dropped in 202615380500 once every reader is deployed.
--
-- Measured 2026-10-04 (prod, direct, USMCA): 12 advances, derived outstanding = stored outstanding_balance on
-- all 12 (sum $0.00 = $0.00).
--
-- Idempotent: CREATE OR REPLACE VIEW / FUNCTION.

CREATE OR REPLACE VIEW driver_finance.v_driver_advance_balances WITH (security_invoker = true) AS
WITH sub AS (
  SELECT d.operating_company_id, d.driver_id, d.coa_account_id AS account_id
  FROM driver_finance.driver_advance_accounts d
  JOIN catalogs.accounts s ON s.id = d.coa_account_id AND s.operating_company_id = d.operating_company_id
  JOIN accounting.chart_of_accounts_roles r ON r.account_id = s.parent_account_id AND r.operating_company_id = d.operating_company_id
       AND r.role = 'advance_recovery' AND r.is_active
  WHERE d.is_active
),
own AS (
  SELECT p.id, p.account_id, p.debit_or_credit, p.amount_cents, p.source_transaction_type, p.source_transaction_id, p.reversal_of_line_id
  FROM accounting.journal_entry_postings p JOIN sub ON sub.account_id = p.account_id
),
disb AS (
  SELECT o.source_transaction_id AS advance_id, o.id AS line_id FROM own o
  WHERE o.source_transaction_type = 'driver_advance' AND o.reversal_of_line_id IS NULL
),
disb_net AS (
  SELECT d.advance_id, SUM(CASE o.debit_or_credit WHEN 'debit' THEN o.amount_cents ELSE -o.amount_cents END) AS cents
  FROM disb d JOIN own o ON o.id = d.line_id OR o.reversal_of_line_id = d.line_id
  GROUP BY d.advance_id
),
recovered AS (
  SELECT sub.driver_id, sub.operating_company_id,
         -COALESCE(SUM(CASE o.debit_or_credit WHEN 'debit' THEN o.amount_cents ELSE -o.amount_cents END), 0) AS cents
  FROM sub LEFT JOIN own o ON o.account_id = sub.account_id
       AND o.id NOT IN (SELECT line_id FROM disb)
       AND NOT EXISTS (SELECT 1 FROM disb x WHERE x.line_id = o.reversal_of_line_id)
  GROUP BY sub.driver_id, sub.operating_company_id
),
per AS (
  SELECT a.id AS advance_id, a.operating_company_id, a.driver_id, a.created_at,
         COALESCE(dn.cents, 0)::bigint AS disbursed_cents,
         COALESCE(rc.cents, 0)::bigint AS driver_recovered_cents
  FROM driver_finance.driver_advances a
  LEFT JOIN disb_net dn ON dn.advance_id = a.id::text
  LEFT JOIN recovered rc ON rc.driver_id = a.driver_id AND rc.operating_company_id = a.operating_company_id
)
SELECT advance_id, operating_company_id, driver_id, disbursed_cents,
       (disbursed_cents - outstanding_cents)::bigint AS recovered_cents,
       outstanding_cents
FROM (
  SELECT per.*,
         GREATEST(0, LEAST(disbursed_cents,
           SUM(disbursed_cents) OVER (PARTITION BY operating_company_id, driver_id ORDER BY created_at, advance_id) - driver_recovered_cents
         ))::bigint AS outstanding_cents
  FROM per
) f
;

COMMENT ON VIEW driver_finance.v_driver_advance_balances IS
  'Driver advance disbursed / recovered / outstanding DERIVED from the GL on the driver''s own 1245 sub-account (ROUND 394 ruling 1, CC-1). The only source for an advance balance. Guard: verify-driver-advance-posts-to-drivers-own-subaccount (rules 6-8).';

GRANT SELECT ON driver_finance.v_driver_advance_balances TO ih35_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON driver_finance.v_driver_advance_balances TO ih35_ci_readonly;
  END IF;
END $$;

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
  FROM (
    -- ROUND 394 RULING 1 — an advance-backed liability's balance is the advance's DERIVED outstanding
    -- (driver_finance.v_driver_advance_balances, from the GL on the driver's own 1245 sub-account), never
    -- the stored current_balance. Other liability types keep current_balance until ruling 2 step 3.
    SELECT l.id, l.type, l.status, l.created_at, l.requires_acknowledgment,
           COALESCE(adv.outstanding_cents / 100.0, l.current_balance)::numeric(14, 2) AS current_balance
      FROM driver_finance.driver_liabilities l
      LEFT JOIN (
        SELECT a.liability_id, a.operating_company_id, sum(vb.outstanding_cents) AS outstanding_cents
          FROM driver_finance.driver_advances a
          JOIN driver_finance.v_driver_advance_balances vb ON vb.advance_id = a.id
         WHERE a.liability_id IS NOT NULL
         GROUP BY a.liability_id, a.operating_company_id
      ) adv ON adv.liability_id = l.id AND adv.operating_company_id = l.operating_company_id
     WHERE l.driver_id = p_driver_id
  ) l;

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

CREATE OR REPLACE VIEW views.banking_account_tiles WITH (security_invoker = true) AS
 SELECT a.id,
    a.operating_company_id,
    NULL::text AS qbo_account_id,
    COALESCE(a.display_name, a.account_name, 'Bank account'::text) AS display_name,
    COALESCE(a.account_type, a.account_class, 'depository'::text) AS account_type,
        CASE
            WHEN (ca.system_purpose = 'cash_dip'::text) THEN 'DIP Operating'::text
            WHEN (ca.system_purpose = 'relay_fuel_wallet'::text) THEN 'Relay Fuel'::text
            WHEN (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%payroll%'::text) THEN 'DIP Payroll'::text
            WHEN (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%operating%'::text) THEN 'DIP Operating'::text
            WHEN (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%credit%'::text) THEN 'Credit'::text
            ELSE 'Other'::text
        END AS tag,
    ((ca.system_purpose = 'cash_dip'::text) OR (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%dip%'::text)) AS is_dip,
    false AS is_relay,
    COALESCE(a.display_order, 0) AS display_order,
        CASE
            WHEN ((ca.system_purpose = 'cash_dip'::text) OR (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%dip%'::text)) THEN 'dip'::text
            WHEN (ca.system_purpose = 'relay_fuel_wallet'::text) THEN 'relay'::text
            WHEN (lower(COALESCE(a.display_name, a.account_name, ''::text)) ~~ '%credit%'::text) THEN 'credit'::text
            ELSE 'bank'::text
        END AS color_tag,
    'real'::text AS tile_kind,
    ((COALESCE(a.current_balance_cents, (0)::bigint))::numeric / (100)::numeric) AS current_balance,
    ( SELECT (count(*))::integer AS count
           FROM banking.bank_transactions bt
          WHERE ((bt.bank_account_id = a.id) AND (bt.operating_company_id = a.operating_company_id) AND (bt.status = ANY (ARRAY['uncategorized'::text, 'pending_categorization'::text])) AND (bt.voided_at IS NULL))) AS uncategorized_count,
    ( SELECT max(bt.transaction_date) AS max
           FROM banking.bank_transactions bt
          WHERE ((bt.bank_account_id = a.id) AND (bt.operating_company_id = a.operating_company_id) AND (bt.voided_at IS NULL))) AS last_txn_date
   FROM (banking.bank_accounts a
     LEFT JOIN catalogs.accounts ca ON (((ca.id = a.ledger_account_id) AND (ca.operating_company_id = a.operating_company_id))))
  WHERE ((a.is_active = true) AND (a.deactivated_at IS NULL) AND (a.hidden_at IS NULL))
UNION ALL
 SELECT '00000000-0000-0000-0000-000000000059'::uuid AS id,
    f.operating_company_id,
    NULL::text AS qbo_account_id,
    'Factoring Reserve'::text AS display_name,
    'virtual_factoring'::text AS account_type,
    'Factoring'::text AS tag,
    false AS is_dip,
    false AS is_relay,
    1000 AS display_order,
    'factoring'::text AS color_tag,
    'virtual'::text AS tile_kind,
    (COALESCE(sum(f.reserve_receivable_signed_cents), (0)::numeric) / (100)::numeric) AS current_balance,
    0 AS uncategorized_count,
    NULL::date AS last_txn_date
   FROM views.factoring_balance_invoice_linkage f
  GROUP BY f.operating_company_id
UNION ALL
 SELECT '00000000-0000-0000-0000-000000000056'::uuid AS id,
    ea.operating_company_id,
    NULL::text AS qbo_account_id,
    'Driver Escrow Pool'::text AS display_name,
    'virtual_escrow'::text AS account_type,
    'Escrow'::text AS tag,
    false AS is_dip,
    false AS is_relay,
    1001 AS display_order,
    'escrow'::text AS color_tag,
    'virtual'::text AS tile_kind,
    (COALESCE(sum(vb.balance_cents), (0)::numeric) / (100)::numeric) AS current_balance,
    0 AS uncategorized_count,
    ( SELECT (max(ep.posted_at))::date AS max
           FROM accounting.escrow_postings ep
          WHERE (ep.operating_company_id = ea.operating_company_id)) AS last_txn_date
   FROM (accounting.escrow_accounts ea
     LEFT JOIN driver_finance.v_driver_escrow_balance vb ON ((vb.escrow_account_id = ea.id)))
  WHERE ((ea.holder_type = 'driver'::text) AND (ea.purpose = 'driver_bond'::text))
  GROUP BY ea.operating_company_id
UNION ALL
 SELECT '00000000-0000-0000-0000-000000000060'::uuid AS id,
    da.operating_company_id,
    NULL::text AS qbo_account_id,
    'Cash Advance Pool'::text AS display_name,
    'virtual_advance'::text AS account_type,
    'DIP Other'::text AS tag,
    true AS is_dip,
    false AS is_relay,
    1002 AS display_order,
    'dip'::text AS color_tag,
    'virtual'::text AS tile_kind,
    round(COALESCE(sum(vb.outstanding_cents), (0)::numeric) / 100.0, 2) AS current_balance,
    0 AS uncategorized_count,
    (max(da.created_at))::date AS last_txn_date
   FROM driver_finance.driver_advances da
     JOIN driver_finance.v_driver_advance_balances vb ON vb.advance_id = da.id
  WHERE (vb.outstanding_cents > 0)
  GROUP BY da.operating_company_id
  ORDER BY 9, 5, 4;

-- The cash-advance list (Outstanding / Paid-off tabs, detail drawer): outstanding_balance is the advance's
-- derived outstanding, not the advance liability's stored current_balance. Same columns, same order.
CREATE OR REPLACE VIEW views.cash_advances_with_context WITH (security_invoker = true) AS
SELECT a.id,
    a.operating_company_id,
    a.display_id,
    a.driver_id,
    (a.amount)::numeric AS amount,
    a.purpose,
    a.disbursement_method,
    a.disbursement_status,
    a.disbursed_at,
    a.recipient_type,
    a.recipient_name,
    a.linked_bill_id,
    a.linked_bank_txn_id,
    a.linked_bill_payment_id,
    a.requires_owner_approval,
    NULL::timestamp with time zone AS approved_at,
    NULL::uuid AS approved_by_user_id,
    a.created_at,
    a.created_by_user_id,
    round((COALESCE(vb.outstanding_cents, (0)::bigint))::numeric / 100.0, 2) AS outstanding_balance,
    l.id AS liability_id,
    concat_ws(' '::text, d.first_name, d.last_name) AS driver_full_name,
    (d.id)::text AS driver_display_id,
    COALESCE(b.display_id, (b.id)::text) AS linked_bill_display_id,
    v.id AS linked_bill_vendor_id,
    a.load_id,
    ld.load_number AS load_display_id
   FROM driver_finance.driver_advances a
     JOIN mdata.drivers d ON d.id = a.driver_id
     LEFT JOIN driver_finance.v_driver_advance_balances vb ON vb.advance_id = a.id
     LEFT JOIN driver_finance.driver_liabilities l ON l.id = a.liability_id
     LEFT JOIN accounting.bills b ON b.id = a.linked_bill_id
     LEFT JOIN mdata.vendors v ON v.id::text = b.vendor_id
     LEFT JOIN mdata.loads ld ON ld.id = a.load_id
  ORDER BY a.created_at DESC;
