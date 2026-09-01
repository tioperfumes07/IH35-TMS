-- 202613340001_settlement_cash_advance_display_id_advisory_lock.sql
-- ACCT-F19367 (board: SETTLEMENT-DISPLAY-ID-UNPROTECTED-RACE) -- driver_finance.next_settlement_display_id()
-- was a bare `SELECT MAX(...)+1`, called from 4 separate INSERT sites, with zero race protection --
-- unlike every sibling display-id series (accounting/display-id.ts), which takes a
-- pg_advisory_xact_lock BEFORE its own MAX()+1 read so two concurrent requests in the same
-- (operating_company_id, year) window serialize instead of racing. A real backing unique index
-- (driver_settlements_operating_company_id_display_id_key) already exists, so the live failure mode
-- for a genuine collision is a 500, not a silent duplicate -- but that still fails the "no 500 on
-- concurrent same-window creates" bar every other series meets.
--
-- Fix: add the SAME pg_advisory_xact_lock discipline INSIDE the existing Postgres function, scoped
-- per (operating_company_id, year) exactly like accounting/display-id.ts's withDisplayLock helper.
-- pg_advisory_xact_lock auto-releases at transaction end, and every one of the 4 call sites already
-- invokes this function and its own INSERT inside the SAME transaction (withCompany/withCompanyScope),
-- so this single function change closes the race for all 4 call sites with no code-site changes.
-- CREATE OR REPLACE is idempotent -- safe to re-run.

CREATE OR REPLACE FUNCTION driver_finance.next_settlement_display_id(p_operating_company_id uuid, p_period_start date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year int := EXTRACT(year FROM p_period_start)::int;
  v_next int := 1;
BEGIN
  -- ACCT-F19367: serialize concurrent callers for the same (opco, year) before the read-then-write
  -- MAX()+1 below, matching accounting/display-id.ts's withDisplayLock pattern.
  PERFORM pg_advisory_xact_lock(hashtext(format('driver_finance.settlement.display_id:%s:%s', p_operating_company_id, v_year)));

  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    SELECT COALESCE(
      MAX(
        CASE
          WHEN display_id ~ ('^S-' || v_year::text || '-[0-9]{4}$')
            THEN right(display_id, 4)::int
          ELSE 0
        END
      ),
      0
    ) + 1
    INTO v_next
    FROM driver_finance.driver_settlements
    WHERE operating_company_id = p_operating_company_id
      AND period_start >= make_date(v_year, 1, 1)
      AND period_start < make_date(v_year + 1, 1, 1);
  END IF;

  RETURN format('S-%s-%s', v_year, lpad(v_next::text, 4, '0'));
END
$function$;
