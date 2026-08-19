-- ACCT-F5513 — verify-worm-coverage-ratchet.mjs regressed (unprotected financial tables 91 -> 92):
-- accounting.vendor_payment_methods (202612640000_vendor_payment_methods_master_data.sql) landed
-- without the database-level trg_worm_refuse_delete trigger that every other tokenized-reference /
-- master-data-in-a-financial-schema table this pattern was modeled on carries as defense-in-depth.
--
-- DELIBERATE JUDGMENT CALL, not a mechanical re-run of the sweep: this table holds no amount, no
-- balance, no posting — its own header says so ("SCOPE = MASTER DATA ONLY"). But it stores vendor
-- bank-payment references (tokenized, never raw numbers) and its own header separately flags "vendor
-- bank-redirect fraud" as "one of the highest-value fraud vectors against a company the size of this
-- one." The table already layers void-not-delete at the grant level (no DELETE granted to ih35_app,
-- is_active/voided_at instead) and an append-only audit trigger (tg_audit_row_vendor_payment_methods)
-- — the database-level WORM trigger is the natural next layer the original migration's own design
-- intent was already pointing at, not scope creep. 139 real financial rows were destroyed on prod and
-- could not be recovered before this control existed; a vendor's payment-routing history is exactly
-- the kind of record whose accidental or malicious deletion this control exists to make impossible.
--
-- NOT extended to driver_finance.driver_payment_methods (the sibling per-driver table,
-- 202607370000) in this migration — that table is currently ALSO unprotected and deserves its own
-- deliberate decision rather than a drive-by copy-paste; filed as its own board item.
--
-- Idempotent (guarded EXISTS check before CREATE, matching 202612650000's pattern exactly).

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'vendor_payment_methods' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'vendor_payment_methods'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.vendor_payment_methods
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
    RAISE NOTICE 'ACCT-F5513: WORM delete-refusal trigger attached to accounting.vendor_payment_methods';
  END IF;
END
$$;

COMMIT;
