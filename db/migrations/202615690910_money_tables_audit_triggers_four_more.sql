-- 443.91 #4 (CC-3) — the WORM audit trigger on the four money-bearing tables created after 202612350000 without it.
-- ACCT-F178 (money-tables-audit-trigger.db.test.ts) found them on a fresh database: accounting.deposit_lines,
-- accounting.expenses_review_queue, accounting.reclassify_batch_lines, driver_finance.settlement_line_item_splits.
-- Same pattern as 202612350000: the EXISTING audit.tg_audit_row(), attached only where the table exists and no audit
-- trigger is already on it — idempotent, replay-safe, additive.
SET LOCAL lock_timeout = '60s';

DO $$
DECLARE
  _t record;
BEGIN
  FOR _t IN
    SELECT * FROM (VALUES
      ('accounting', 'deposit_lines'),
      ('accounting', 'expenses_review_queue'),
      ('accounting', 'reclassify_batch_lines'),
      ('driver_finance', 'settlement_line_item_splits')
    ) AS v(nsp, rel)
  LOOP
    IF to_regclass(format('%I.%I', _t.nsp, _t.rel)) IS NULL THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = _t.nsp AND c.relname = _t.rel AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
      _t.rel, _t.nsp, _t.rel
    );
  END LOOP;
END $$;
