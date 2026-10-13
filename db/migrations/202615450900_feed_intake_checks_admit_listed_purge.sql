-- 202615450900_feed_intake_checks_admit_listed_purge.sql
-- CC-3 · ROUND 443.9 PURGE REMNANTS (owner 2026-10-10: "there should be nothing from before that is why we deleted
-- and purged" · "delete anything related to the purge. Not any banking transactions.").
--
-- MEASURED (prod, bypass_rls, USMCA): driver_finance.feed_intakes 2 rows + driver_finance.feed_intake_checks 24 rows
-- whose subject invoices (dbf93c60-…, 7858b5fd-…) no longer exist. feed_intakes already admits the owner's listed
-- rows (trg_worm_refuse_delete -> accounting.refuse_financial_row_delete, ARM L). feed_intake_checks' own WORM
-- trigger (fn_feed_intake_checks_worm) refused DELETE from every role with no arm at all, so the purge engine
-- (accounting._purge_rows_cascade) could not remove a check row even when its intake was listed — that is why the
-- AUTH-400 purge left them.
--
-- This gives feed_intake_checks the SAME arm the other append-only tables have (202615410200) and nothing more:
--   * DELETE only, and only a row listed in _system.purge_authorized_rows for the AUTH in app.purge_auth_id, OR a
--     check row whose intake is listed for that AUTH (the intake and its checks go together, never one without).
--   * UPDATE stays refused for every role, always.
--   * no AUTH, or a row not listed -> the same refusal as before.
-- Idempotent (CREATE OR REPLACE). No data changes. No trigger is added, dropped or re-pointed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION driver_finance.fn_feed_intake_checks_worm()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth
                    AND ((r.table_name = 'driver_finance.feed_intake_checks' AND r.row_pk = OLD.id::text)
                      OR (r.table_name = 'driver_finance.feed_intakes' AND r.row_pk = OLD.intake_id::text))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'feed_intake_checks is append-only (WORM): re-run the intake to append run %', COALESCE(OLD.run_no, 0) + 1
    USING ERRCODE = 'check_violation';
END;
$fn$;

COMMIT;
