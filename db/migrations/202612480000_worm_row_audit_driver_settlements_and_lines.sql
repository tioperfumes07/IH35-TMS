-- ACCT-F292 — attach the EXISTING row-audit trigger to the two driver-pay tables that lack it.
--
-- FINDING (verified on prod br-fancy-credit-akjnd07a, bypass_rls in the same txn):
--   driver_finance.driver_bills      -> HAS tg_audit_row_driver_bills (audit.tg_audit_row)
--   driver_finance.driver_settlements-> NO audit-row trigger
--   driver_finance.settlement_lines  -> NO audit-row trigger
-- audit.row_changes holds 2,342,260 rows across 34 distinct tables; the ENTIRE driver_finance schema
-- accounts for 1. So a settlement can be created, re-priced, closed and locked, and its earnings
-- lines written, with no row-level audit trail — while the payable that feeds it is fully audited.
-- That is the half of the money chain an auditor asks about: who changed what the driver was paid.
--
-- REUSES EXISTING MACHINERY. No new audit function, no new table, no new column, no GL math. This
-- attaches audit.tg_audit_row -- the same function driver_bills already uses -- to two more tables,
-- with the same event list (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW) copied from the live
-- pg_get_triggerdef output rather than retyped from memory.
--
-- DELETE is kept in the event list even though trg_worm_refuse_delete refuses deletes on these
-- tables. The two are not redundant: the refusal is the control, and the audit row is the evidence.
-- If the refusal is ever dropped, weakened, or bypassed by a superuser path, the audit trigger is
-- what records that it happened. A control with no independent evidence is not an auditable control.
--
-- NO BACKFILL, DELIBERATELY. Rows that predate this trigger legitimately have no audit row.
-- Manufacturing history for them would fabricate an audit trail, which is worse than the gap.
--
-- IDEMPOTENT: guarded on pg_trigger, so a re-run is a no-op and this is safe to apply more than once.
-- ALSO GUARDED ON THE PREREQUISITES: if audit.tg_audit_row or a target table is absent (fresh CI DB
-- built from an earlier point), the block skips that table instead of failing the whole migration.

DO $$
DECLARE
  t text;
  targets text[] := ARRAY['driver_settlements', 'settlement_lines'];
BEGIN
  -- Prerequisite: the shared audit function must exist. If it does not, skip silently rather than
  -- fail — a fresh CI database may not have reached the migration that creates it.
  IF to_regprocedure('audit.tg_audit_row()') IS NULL THEN
    RAISE NOTICE 'ACCT-F292: audit.tg_audit_row() not present; skipping trigger attach.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('driver_finance.' || t) IS NULL THEN
      RAISE NOTICE 'ACCT-F292: driver_finance.% not present; skipping.', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'driver_finance'
        AND c.relname = t
        AND NOT tg.tgisinternal
        AND tg.tgname = 'tg_audit_row_' || t
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON driver_finance.%I '
        'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
        'tg_audit_row_' || t,
        t
      );
      RAISE NOTICE 'ACCT-F292: attached tg_audit_row_% to driver_finance.%', t, t;
    END IF;
  END LOOP;
END
$$;
