-- 443.100 C2 lane 3 (CC-3) — the WORM audit trigger on the two driver_finance feed-gate tables created by
-- 202615170400 without it. verify-driver-finance-money-tables-row-audited FAILS on prod read-only (2026-10-12):
-- driver_finance.feed_intakes and driver_finance.feed_intake_checks have no audit.tg_audit_row-backed trigger, so
-- "who opened / passed / blocked / voided this settlement intake, and when" is unanswerable.
-- Same pattern as 202615690910: the EXISTING audit.tg_audit_row(), attached only where the table exists and no audit
-- trigger is already on it — idempotent, replay-safe, additive.
SET LOCAL lock_timeout = '60s';

DO $$
DECLARE
  _t record;
BEGIN
  FOR _t IN
    SELECT * FROM (VALUES
      ('driver_finance', 'feed_intakes'),
      ('driver_finance', 'feed_intake_checks')
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
