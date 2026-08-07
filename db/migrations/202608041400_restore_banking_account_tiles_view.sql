-- BANK-F604 — restore views.banking_account_tiles (dead WHERE false stub on prod since 0044 ELSE branch).
--
-- WHAT WENT WRONG. Migration 0044 defines this view inside a DO block whose IF branch requires phantom
-- columns (banking.bank_accounts.visible, banking.bank_account_balances, bank_transactions.account_id /
-- txn_date / factoring_advance_id, accounting.factoring_companies). On prod none of those preconditions
-- hold — verified 2026-08-04 via pg_get_viewdef: "SELECT NULL::uuid ... WHERE false;". Every Banking Home
-- tile, DIP KPI, factoring-reserve KPI, and driver-escrow KPI sourced from this view reads $0 forever.
--
-- FIX. CREATE OR REPLACE against the CANONICAL prod schema (bank_accounts.current_balance_cents,
-- bank_transactions.bank_account_id / transaction_date / status, driver_finance.escrow_balances,
-- views.factoring_balance_invoice_linkage). Same column list + order as 0044 so downstream KPI view stays valid.
-- Refuses to re-create the empty stub — a silently empty banking tile view is the defect this removes.
--
-- ADDITIVE · IDEMPOTENT · security_invoker preserved · no table DDL · no row writes.

BEGIN;

DO $$
DECLARE
  hidden_filter text := '';
  voided_filter text := '';
  factoring_union text := '';
  escrow_union text := '';
  advance_union text := '';
BEGIN
  IF to_regclass('banking.bank_accounts') IS NULL OR to_regclass('banking.bank_transactions') IS NULL THEN
    RAISE EXCEPTION
      'BANK-F604: banking.bank_accounts and banking.bank_transactions must both exist before restoring views.banking_account_tiles. Refusing to re-create the empty stub.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'banking'
      AND table_name = 'bank_accounts'
      AND column_name = 'hidden_at'
  ) THEN
    hidden_filter := ' AND a.hidden_at IS NULL';
  END IF;

  -- voided_at arrives in 202609010050 (F9-01); this migration runs earlier on fresh CI db:reset.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'banking'
      AND table_name = 'bank_transactions'
      AND column_name = 'voided_at'
  ) THEN
    voided_filter := ' AND bt.voided_at IS NULL';
  END IF;

  IF to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL THEN
    factoring_union := $F$
      UNION ALL
      SELECT
        '00000000-0000-0000-0000-000000000059'::uuid AS id,
        f.operating_company_id,
        NULL::text AS qbo_account_id,
        'Factoring Reserve'::text AS display_name,
        'virtual_factoring'::text AS account_type,
        'Factoring'::text AS tag,
        false AS is_dip,
        false AS is_relay,
        1000::int AS display_order,
        'factoring'::text AS color_tag,
        'virtual'::text AS tile_kind,
        (COALESCE(SUM(f.reserve_receivable_signed_cents), 0)::numeric / 100)::numeric AS current_balance,
        0::int AS uncategorized_count,
        NULL::date AS last_txn_date
      FROM views.factoring_balance_invoice_linkage f
      GROUP BY f.operating_company_id
    $F$;
  END IF;

  IF to_regclass('driver_finance.escrow_balances') IS NOT NULL THEN
    escrow_union := $E$
      UNION ALL
      SELECT
        '00000000-0000-0000-0000-000000000056'::uuid AS id,
        eb.operating_company_id,
        NULL::text AS qbo_account_id,
        'Driver Escrow Pool'::text AS display_name,
        'virtual_escrow'::text AS account_type,
        'Escrow'::text AS tag,
        false AS is_dip,
        false AS is_relay,
        1001::int AS display_order,
        'escrow'::text AS color_tag,
        'virtual'::text AS tile_kind,
        (COALESCE(SUM(eb.current_balance_cents), 0)::numeric / 100)::numeric AS current_balance,
        0::int AS uncategorized_count,
        (
          SELECT MAX(el.created_at)::date
          FROM driver_finance.escrow_ledger el
          WHERE el.operating_company_id = eb.operating_company_id
        ) AS last_txn_date
      FROM driver_finance.escrow_balances eb
      GROUP BY eb.operating_company_id
    $E$;
  END IF;

  IF to_regclass('driver_finance.driver_advances') IS NOT NULL THEN
    advance_union := $A$
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
        (COALESCE(SUM(da.outstanding_balance), 0)::numeric)::numeric AS current_balance,
        0::int AS uncategorized_count,
        MAX(da.created_at)::date AS last_txn_date
      FROM driver_finance.driver_advances da
      WHERE da.status = 'outstanding'
      GROUP BY da.operating_company_id
    $A$;
  END IF;

  EXECUTE format($VIEW$
    CREATE OR REPLACE VIEW views.banking_account_tiles
    WITH (security_invoker = true) AS
    SELECT
      a.id,
      a.operating_company_id,
      NULL::text AS qbo_account_id,
      COALESCE(a.display_name, a.account_name, 'Bank account')::text AS display_name,
      COALESCE(a.account_type, a.account_class, 'depository')::text AS account_type,
      CASE
        WHEN ca.system_purpose = 'cash_dip' THEN 'DIP Operating'
        WHEN ca.system_purpose = 'relay_fuel_wallet' THEN 'Relay Fuel'
        WHEN lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%payroll%%' THEN 'DIP Payroll'
        WHEN lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%operating%%' THEN 'DIP Operating'
        WHEN lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%credit%%' THEN 'Credit'
        ELSE 'Other'
      END::text AS tag,
      (
        ca.system_purpose = 'cash_dip'
        OR lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%dip%%'
      ) AS is_dip,
      false AS is_relay,
      COALESCE(a.display_order, 0)::int AS display_order,
      CASE
        WHEN ca.system_purpose = 'cash_dip'
          OR lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%dip%%' THEN 'dip'
        WHEN ca.system_purpose = 'relay_fuel_wallet' THEN 'relay'
        WHEN lower(COALESCE(a.display_name, a.account_name, '')) LIKE '%%credit%%' THEN 'credit'
        ELSE 'bank'
      END::text AS color_tag,
      'real'::text AS tile_kind,
      (COALESCE(a.current_balance_cents, 0)::numeric / 100)::numeric AS current_balance,
      (
        SELECT COUNT(*)::int
        FROM banking.bank_transactions bt
        WHERE bt.bank_account_id = a.id
          AND bt.operating_company_id = a.operating_company_id
          AND bt.status IN ('uncategorized', 'pending_categorization')
          %s
      ) AS uncategorized_count,
      (
        SELECT MAX(bt.transaction_date)
        FROM banking.bank_transactions bt
        WHERE bt.bank_account_id = a.id
          AND bt.operating_company_id = a.operating_company_id
          %s
      ) AS last_txn_date
    FROM banking.bank_accounts a
    LEFT JOIN catalogs.accounts ca
      ON ca.id = a.ledger_account_id
     AND ca.operating_company_id = a.operating_company_id
    WHERE a.is_active = true
      AND a.deactivated_at IS NULL
      %s
    %s
    %s
    %s
    ORDER BY display_order, account_type, display_name
  $VIEW$, voided_filter, voided_filter, hidden_filter, factoring_union, escrow_union, advance_union);
  -- DEPLOY-F01 argument order: format() fills %s IN ORDER OF APPEARANCE. The first two placeholders sit
  -- inside correlated sub-selects over banking.bank_transactions bt (uncategorized_count, last_txn_date)
  -- and therefore need voided_filter, which references bt. The THIRD sits in the OUTER query's WHERE,
  -- where bt is NOT in scope, and must receive hidden_filter (which references a). The original order
  -- (hidden, voided, voided) pushed "AND bt.voided_at IS NULL" into that outer WHERE, so the view body
  -- failed to parse with: missing FROM-clause entry for table "bt".
  -- db:migrate is the FIRST link of Render's preDeploy chain, so this aborted every production deploy —
  -- prod sat 33 commits behind at de40811 while each new deploy died here.
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

GRANT SELECT ON views.banking_account_tiles TO ih35_app;
GRANT SELECT ON views.banking_dashboard_kpis TO ih35_app;

COMMIT;
