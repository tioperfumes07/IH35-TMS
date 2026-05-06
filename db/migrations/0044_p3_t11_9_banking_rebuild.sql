BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL
     AND to_regclass('banking.bank_transactions') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.banking_account_tiles
      WITH (security_invoker = true) AS
      SELECT
        a.id,
        a.operating_company_id,
        a.qbo_account_id,
        a.display_name,
        a.account_type,
        a.tag,
        a.is_dip,
        a.is_relay,
        a.display_order,
        a.color_tag,
        'real'::text AS tile_kind,
        COALESCE(bal.current_balance, 0)::numeric AS current_balance,
        (
          SELECT COUNT(*)::int
          FROM banking.bank_transactions bt
          WHERE bt.account_id = a.id
            AND bt.status = 'uncategorized'
        ) AS uncategorized_count,
        (
          SELECT MAX(bt.txn_date)
          FROM banking.bank_transactions bt
          WHERE bt.account_id = a.id
        ) AS last_txn_date
      FROM banking.bank_accounts a
      LEFT JOIN LATERAL (
        SELECT ab.current_balance
        FROM banking.bank_account_balances ab
        WHERE ab.account_id = a.id
        ORDER BY ab.computed_at DESC
        LIMIT 1
      ) bal ON TRUE
      WHERE a.visible = true

      UNION ALL

      SELECT
        '00000000-0000-0000-0000-000000000059'::uuid AS id,
        fc.operating_company_id,
        NULL::text AS qbo_account_id,
        COALESCE(fc.display_name, 'Factoring Reserve')::text AS display_name,
        'virtual_factoring'::text AS account_type,
        'Factoring'::text AS tag,
        false AS is_dip,
        false AS is_relay,
        1000::int AS display_order,
        'factoring'::text AS color_tag,
        'virtual'::text AS tile_kind,
        (COALESCE(fc.current_reserve_balance, 0) + COALESCE(fc.current_chargeback_balance, 0))::numeric AS current_balance,
        (
          SELECT COUNT(*)::int
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = fc.operating_company_id
            AND bt.factoring_advance_id IS NOT NULL
            AND bt.status = 'uncategorized'
        ) AS uncategorized_count,
        fc.last_advance_at::date AS last_txn_date
      FROM accounting.factoring_companies fc
      WHERE fc.active = true

      UNION ALL

      SELECT
        '00000000-0000-0000-0000-000000000056'::uuid AS id,
        d.operating_company_id,
        NULL::text AS qbo_account_id,
        'Driver Escrow Pool'::text AS display_name,
        'virtual_escrow'::text AS account_type,
        'Escrow'::text AS tag,
        false AS is_dip,
        false AS is_relay,
        1001::int AS display_order,
        'escrow'::text AS color_tag,
        'virtual'::text AS tile_kind,
        COALESCE(SUM(d.escrow_balance), 0)::numeric AS current_balance,
        0::int AS uncategorized_count,
        (
          SELECT MAX(el.created_at)::date
          FROM driver_finance.escrow_ledger el
          WHERE el.operating_company_id = d.operating_company_id
        ) AS last_txn_date
      FROM mdata.drivers d
      WHERE d.deactivated_at IS NULL
      GROUP BY d.operating_company_id

      UNION ALL

      SELECT
        '00000000-0000-0000-0000-000000000060'::uuid AS id,
        da.operating_company_id,
        NULL::text AS qbo_account_id,
        'Cash Advance Pool'::text AS display_name,
        'virtual_advance'::text AS account_type,
        'DIP Other'::text AS tag,
        true AS is_dip,
        false AS is_relay,
        1002::int AS display_order,
        'dip'::text AS color_tag,
        'virtual'::text AS tile_kind,
        COALESCE(SUM(da.outstanding_balance), 0)::numeric AS current_balance,
        0::int AS uncategorized_count,
        MAX(da.created_at)::date AS last_txn_date
      FROM driver_finance.driver_advances da
      WHERE da.status = 'outstanding'
      GROUP BY da.operating_company_id
      ORDER BY display_order, account_type, display_name
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.banking_account_tiles
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS operating_company_id,
        NULL::text AS qbo_account_id,
        NULL::text AS display_name,
        NULL::text AS account_type,
        NULL::text AS tag,
        false AS is_dip,
        false AS is_relay,
        0::int AS display_order,
        NULL::text AS color_tag,
        NULL::text AS tile_kind,
        0::numeric AS current_balance,
        0::int AS uncategorized_count,
        NULL::date AS last_txn_date
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

CREATE OR REPLACE VIEW views.banking_dashboard_kpis
WITH (security_invoker = true) AS
SELECT
  operating_company_id,
  SUM(CASE WHEN tile_kind = 'real' THEN current_balance ELSE 0 END) AS total_cash,
  SUM(CASE WHEN tag IN ('DIP Operating','DIP Payroll','DIP Other') THEN current_balance ELSE 0 END) AS total_dip_cash,
  SUM(CASE WHEN tag = 'DIP Operating' THEN current_balance ELSE 0 END) AS dip_operating,
  SUM(CASE WHEN tag = 'DIP Payroll' THEN current_balance ELSE 0 END) AS dip_payroll,
  SUM(CASE WHEN tag = 'Factoring' THEN current_balance ELSE 0 END) AS factoring_reserve,
  SUM(CASE WHEN tag = 'Escrow' THEN current_balance ELSE 0 END) AS driver_escrow,
  SUM(uncategorized_count) AS total_uncategorized
FROM views.banking_account_tiles
GROUP BY operating_company_id;

COMMIT;
