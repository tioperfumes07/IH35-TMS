-- 202615410500_pm_alerts_admit_auth_listed_purge.sql
-- CC-1 · AUTH-401 — append-only maintenance.pm_alerts admits the owner's row-by-row purge, nothing more.
--
-- The AUTH-401 rehearsal (br-fancy-hill-akhyqh18) rolled back: "maintenance.pm_alerts is append-only — DELETE is not
-- allowed". The alert generated for the owner-approved TEST PM schedule could never be removed with it. Same arm every other
-- WORM table has (ARM L — 202615410200 escrow_postings / stop_arrivals, 202615410400 cash-basis snapshot): DELETE of a row
-- listed in _system.purge_authorized_rows for app.purge_auth_id (^AUTH-[0-9]+$) only; anything else stays refused.
-- Idempotent (CREATE OR REPLACE). No data changes. No trigger added, dropped or re-pointed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION maintenance.pm_alerts_delete_block()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = 'maintenance.pm_alerts' AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'maintenance.pm_alerts is append-only — DELETE is not allowed';
END;
$fn$;

COMMIT;
