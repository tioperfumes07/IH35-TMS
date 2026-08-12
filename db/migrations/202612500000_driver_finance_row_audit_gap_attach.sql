-- FINDING: WORM-ROW-AUDIT-GAP-IS-23-TABLES (updates WORM-ROW-AUDIT-ASYMMETRIC-IN-DRIVER-PAY-CHAIN).
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a (bypass_rls=lucia as its own statement, pg_trigger/pg_proc,
-- joined on FUNCTION name audit.tg_audit_row rather than a specific trigger name, since every existing
-- attachment names its trigger tg_audit_row_<table> — not the bare function name):
--   driver_finance has 37 base tables. 14 already carry a trigger backed by audit.tg_audit_row:
--   abandonment_chargebacks, cash_advance_requests, driver_bills, driver_deduction_bucket_events,
--   driver_deduction_buckets, driver_escrow_separations, driver_reimbursements,
--   driver_settlement_deductions, driver_settlement_disputes, escrow_balances,
--   escrow_deductions_pending, escrow_ledger, settlement_contract_lines, settlement_disputes.
--   23 do NOT — independently re-derived here and it matches the board finding's count exactly.
--
-- "Who changed what the driver was paid, and when" is currently unanswerable for the 23: they include
-- driver_settlements, settlement_lines, driver_advances, driver_liabilities, driver_pay_rates,
-- deduction_schedule, team_settlement_splits, settlement_payment_events, and all THREE GL-run tables
-- (driver_settlement_gl_runs, driver_settlement_gl_bills, payrun_gl_runs).
--
-- THIS MIGRATION ATTACHES TO 19 OF THE 23 — an explicit list, not a predicate, because these are
-- config/rate/state tables (driver_pay_rates, escrow_settings, settlement_contract_terms_config) as
-- much as transaction tables, and the money-column predicate ACCT-F178 (202612350000) used
-- (amount_cents/total_cents/balance_cents/debit_or_credit) does not name a column on several of them —
-- which is exactly why that migration's predicate did not already catch this gap. No new audit
-- machinery, no new column, no GL math, no data change — reuses the existing audit.tg_audit_row(),
-- same function every other driver_finance audit trigger already calls.
--
--   abandonment_defaults, auto_deduction_policies, deduction_schedule, driver_advance_accounts,
--   driver_advances, driver_liabilities, driver_pay_rates, driver_pay_settings,
--   driver_payment_methods, driver_settlement_gl_bills, driver_settlement_gl_runs, driver_settlements,
--   escrow_settings, payrun_gl_runs, settlement_contract_terms_config, settlement_lines,
--   settlement_payment_events, signed_acknowledgments, team_settlement_splits.
--
-- 4 EXCLUDED, with the reason stated so the omission is not read as an oversight and is not "fixed"
-- later by a blind sweep:
--   cash_advance_owner_approval_audit, cash_advance_request_audit — these ARE audit sinks. Auditing an
--     audit table is circular and doubles write volume on every approval.
--   trip_link_queue — a transient work queue; rows are consumed, not kept.
--   settlement_preview_costs — an ephemeral preview recomputed on demand; it is not the settlement.
-- 19 attached + 4 excluded = the full 23, accounted for rather than sampled.
--
-- Do NOT backfill audit.row_changes for these tables' pre-migration history — rows predating the
-- trigger legitimately have no audit row (Rule: never invent history). Do NOT drop the 4 exclusions in
-- later work without reading the reasons stated above.
--
-- IDEMPOTENT: every trigger is created only when the table has no audit.tg_audit_row-backed trigger
-- yet, so a re-run is a no-op and this can be replayed on a branch or a fresh database safely.
-- Verify-step 2961 (verify-driver-finance-money-tables-row-audited, already claimed on main) enumerates
-- its own denominator (all driver_finance base tables), so a newly added table cannot join this gap
-- silently going forward.

BEGIN;

DO $$
DECLARE
  r record;
  v_targets text[] := ARRAY[
    'abandonment_defaults',
    'auto_deduction_policies',
    'deduction_schedule',
    'driver_advance_accounts',
    'driver_advances',
    'driver_liabilities',
    'driver_pay_rates',
    'driver_pay_settings',
    'driver_payment_methods',
    'driver_settlement_gl_bills',
    'driver_settlement_gl_runs',
    'driver_settlements',
    'escrow_settings',
    'payrun_gl_runs',
    'settlement_contract_terms_config',
    'settlement_lines',
    'settlement_payment_events',
    'signed_acknowledgments',
    'team_settlement_splits'
  ];
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'driver_finance'
       AND c.relkind = 'r'
       AND c.relname = ANY (v_targets)
       AND NOT EXISTS (
         SELECT 1
           FROM pg_trigger t
           JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = c.oid AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
       )
     ORDER BY 1
  LOOP
    -- Trigger name is derived from the table, so a re-run finds the existing trigger via the NOT
    -- EXISTS above and this loop body simply never executes for it. Idempotent by construction.
    EXECUTE format(
      'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON driver_finance.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
      r.table_name, r.table_name
    );
    RAISE NOTICE 'WORM-ROW-AUDIT-GAP-IS-23-TABLES: audit trigger attached to driver_finance.%', r.table_name;
  END LOOP;
END
$$;

COMMIT;
