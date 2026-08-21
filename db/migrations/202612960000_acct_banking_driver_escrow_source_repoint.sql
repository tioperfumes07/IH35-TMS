-- ACCT-F5703 — repoint views.banking_account_tiles' "Escrow" tile off the near-empty
-- driver_finance.escrow_balances/escrow_ledger tables onto the canonical, GL-linked
-- accounting.escrow_accounts/escrow_postings tables.
--
-- WHAT WENT WRONG. `/banking/driver-escrow` (and the "Driver Escrow Pool" KPI tile on Banking Home)
-- have always read driver_finance.escrow_balances/escrow_ledger — a separate, largely-unpopulated
-- operational ledger (1 row system-wide, live-confirmed 2026-08-21) that was never kept in sync with
-- accounting.escrow_accounts/escrow_postings, the real GL-linked liability subledger Block-23 already
-- maintains and /accounting/escrow already reads correctly (11 real USMCA driver_bond rows, one with a
-- real $250.00 balance backed by a posted JE). Filed by CC-2 as
-- BANKING-DRIVER-ESCROW-VIEW-BLIND-TO-REAL-ACCOUNTING-DATA, routed to CC-1 (money-source wiring).
--
-- FIX (this migration). Repoints ONLY the escrow_union block inside views.banking_account_tiles'
-- CREATE OR REPLACE (same dynamic-DO-block shape as 202608041400, same column list/order so the
-- downstream views.banking_dashboard_kpis "Escrow" -> driver_escrow tag mapping stays valid) to sum
-- accounting.escrow_accounts.balance_cents for holder_type='driver', purpose='driver_bond' rows, with
-- last_txn_date sourced from accounting.escrow_postings instead of driver_finance.escrow_ledger.
-- The three OTHER conditional unions (factoring, advance_pool) and the real bank-account SELECT are
-- reproduced verbatim, unchanged, from 202608041400 -- CREATE OR REPLACE VIEW requires the whole view
-- body even when only one branch changes.
--
-- The backend route-level fix (escrow-visualizer.routes.ts, banking.routes.ts virtual register branch,
-- driver-escrow-counts.ts) ships in the same PR as this migration, not here — this migration only
-- repoints the KPI VIEW.
--
-- ADDITIVE · IDEMPOTENT (CREATE OR REPLACE) · security_invoker preserved · no table DDL · no row writes.

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
      'ACCT-F5703: banking.bank_accounts and banking.bank_transactions must both exist before repointing views.banking_account_tiles.';
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

  -- ACCT-F5703: repointed off driver_finance.escrow_balances/escrow_ledger onto the canonical,
  -- GL-linked accounting.escrow_accounts/escrow_postings tables.
  IF to_regclass('accounting.escrow_accounts') IS NOT NULL THEN
    escrow_union := $E$
      UNION ALL
      SELECT
        '00000000-0000-0000-0000-000000000056'::uuid AS id,
        ea.operating_company_id,
        NULL::text AS qbo_account_id,
        'Driver Escrow Pool'::text AS display_name,
        'virtual_escrow'::text AS account_type,
        'Escrow'::text AS tag,
        false AS is_dip,
        false AS is_relay,
        1001::int AS display_order,
        'escrow'::text AS color_tag,
        'virtual'::text AS tile_kind,
        (COALESCE(SUM(ea.balance_cents), 0)::numeric / 100)::numeric AS current_balance,
        0::int AS uncategorized_count,
        (
          SELECT MAX(ep.posted_at)::date
          FROM accounting.escrow_postings ep
          WHERE ep.operating_company_id = ea.operating_company_id
        ) AS last_txn_date
      FROM accounting.escrow_accounts ea
      WHERE ea.holder_type = 'driver'
        AND ea.purpose = 'driver_bond'
      GROUP BY ea.operating_company_id
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
END
$$;

-- views.banking_dashboard_kpis is unchanged (CREATE OR REPLACE re-asserted for idempotency/clarity only)
-- -- it already sums current_balance for tag='Escrow' rows from views.banking_account_tiles, which now
-- correctly reflects accounting.escrow_accounts instead of the near-empty driver_finance tables.
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
