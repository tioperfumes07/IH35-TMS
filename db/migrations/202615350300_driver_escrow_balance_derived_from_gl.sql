-- 202615350300_driver_escrow_balance_derived_from_gl.sql
-- CC-1 · Lead order "KILL THE SECOND SYSTEM. THE LEDGER IS THE BALANCE. POLICIES STAY." — escrow, step 1 of 2:
-- the derived balance every reader moves to BEFORE any stored column goes.
--
-- The GL account that owns the number: each driver's own escrow sub-account 2100-00-<nnn> (parent 2100 Driver Escrow –
-- Held in Trust), reached through the accounting.escrow_accounts mapping row (holder = the driver, coa_account_id =
-- the sub-account). The mapping row STAYS; its stored balance_cents does not count any more.
--
-- MEASURED ON PROD 2026-10-03 (bypass): 45 driver escrow mappings; the stored driver_finance.escrow_balances
-- .current_balance_cents disagrees with the 2100-00-<nnn> GL balance on 10 drivers, accounting.escrow_accounts
-- .balance_cents on 11 — the second system has already drifted. A CPA can recompute every one of these numbers from the
-- postings, so they are derived:
--   held_cents      = Σ credits posted to the sub-account (contributions; a reversal of a release is a credit)
--   released_cents  = Σ debits posted to the sub-account (releases, forfeits, and reversals of contributions)
--   balance_cents   = held_cents − released_cents  (the liability balance, credit-normal)
-- Posted journal entries only. security_invoker, so every reader keeps its own company scope (RLS).
-- No data change. Drifted stored rows are NOT repaired — they stop being read, then stop existing (step 2).
BEGIN;
SET LOCAL lock_timeout = '10s';

-- Every escrow account (any holder type) — the balance of its own GL account, from the postings.
CREATE OR REPLACE VIEW accounting.v_escrow_account_balance WITH (security_invoker = true) AS
SELECT ea.id                                                                            AS escrow_account_id,
       ea.operating_company_id,
       ea.holder_type,
       ea.holder_id,
       ea.purpose,
       ea.status,
       ea.coa_account_id,
       a.account_number,
       COALESCE(sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit'), 0)::bigint AS held_cents,
       COALESCE(sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit'), 0)::bigint  AS released_cents,
       COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS balance_cents,
       count(p.id)::bigint                                                              AS posting_count,
       max(j.entry_date)                                                                AS last_posted_on
  FROM accounting.escrow_accounts ea
  JOIN catalogs.accounts a ON a.id = ea.coa_account_id
  LEFT JOIN (accounting.journal_entry_postings p
             JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted')
         ON p.account_id = ea.coa_account_id
 GROUP BY ea.id, ea.operating_company_id, ea.holder_type, ea.holder_id, ea.purpose, ea.status, ea.coa_account_id, a.account_number;

-- The driver's escrow (the damage fund) — the same derivation, ONE row per sub-account:
--   * a sub-account that carries a closed mapping from a merged-away duplicate driver record AND an active mapping
--     (measured: 2100-00-023 Genaro, 2100-00-024 Angel) is counted once, on the active mapping — never twice;
--   * a mapping onto the POOLED parent (the account bound to escrow_liability_default — measured: one closed mapping
--     onto 2100) is never a driver's balance.
CREATE OR REPLACE VIEW driver_finance.v_driver_escrow_balance WITH (security_invoker = true) AS
SELECT v.operating_company_id,
       v.holder_id AS driver_id,
       v.escrow_account_id,
       v.coa_account_id,
       v.account_number,
       v.held_cents,
       v.released_cents,
       v.balance_cents,
       v.posting_count,
       v.last_posted_on
  FROM accounting.v_escrow_account_balance v
 WHERE v.holder_type = 'driver'
   AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                    WHERE r.account_id = v.coa_account_id AND r.role = 'escrow_liability_default')
   AND (v.status = 'active'
        OR NOT EXISTS (SELECT 1 FROM accounting.escrow_accounts e2
                        WHERE e2.coa_account_id = v.coa_account_id AND e2.holder_type = 'driver'
                          AND e2.status = 'active' AND e2.id <> v.escrow_account_id));

-- The Banking home "Driver Escrow Pool" tile summed the stored accounting.escrow_accounts.balance_cents. Re-created from
-- PROD's exact definition (pg_get_viewdef, 2026-10-03) with ONLY the escrow branch changed: it now sums each driver's
-- derived GL balance. Every other tile, column, type and order is unchanged; security_invoker kept.
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
    COALESCE(sum(da.outstanding_balance), (0)::numeric) AS current_balance,
    0 AS uncategorized_count,
    (max(da.created_at))::date AS last_txn_date
   FROM driver_finance.driver_advances da
  WHERE (da.status = 'outstanding'::text)
  GROUP BY da.operating_company_id
  ORDER BY 9, 5, 4;

COMMENT ON VIEW driver_finance.v_driver_escrow_balance IS
  'Driver escrow balance DERIVED from the driver''s 2100-00-<nnn> GL sub-account (Kill-the-second-system order, CC-1). The only source any screen, report, API or service may read for a driver escrow balance. Guard: verify-escrow-equals-its-gl.';

GRANT SELECT ON accounting.v_escrow_account_balance TO ih35_app;
GRANT SELECT ON driver_finance.v_driver_escrow_balance TO ih35_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON accounting.v_escrow_account_balance TO ih35_ci_readonly;
    GRANT SELECT ON driver_finance.v_driver_escrow_balance TO ih35_ci_readonly;
  END IF;
END $$;
COMMIT;
