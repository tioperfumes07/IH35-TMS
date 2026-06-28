-- CC-06 / Phase 4 SECURITY — FORCE ROW LEVEL SECURITY on 8 financial tables.
-- These tables have RLS ENABLED but FORCE-OFF (pg_class.relforcerowsecurity = false), so a
-- table-OWNER / elevated role bypasses tenant isolation. FORCE makes the RLS policy apply to the
-- owner too. The app runs as non-owner ih35_app (so this is defense-in-depth, not active app
-- exposure today), but scripts/migrations/direct connections run as owner — force it.
-- Driver-money tables first. Idempotent (ALTER ... FORCE is a no-op if already set) and
-- fresh-DB-safe (guarded by to_regclass so it never errors if a table is absent).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driver_finance.escrow_ledger',
    'driver_finance.escrow_balances',
    'driver_finance.settlement_lines',
    'accounting.ar_collection_contacts',
    'accounting.cash_flow_adjustments',
    'accounting.recurring_bill_templates',
    'accounting.recurring_bill_generation_log',
    'settlements.settlement_disputes'
  ]
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
