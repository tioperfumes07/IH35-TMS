-- 202616110700_driver_bills_awaiting_short_miles.sql  (CC-2, claimed on main first in #27131 — LEAD 443.220)
-- OWNER 10-21 7:34 PM CT: "why no driver bill, it should be created automatically."
-- MEASURED (prod audit.audit_events): 13697 / 13699 were booked with no SHORT miles; the mint gate logged
-- driver_finance.driver_bill.refused_no_shortest_miles and wrote NO bill — the dispatcher never knew.
-- LEAD RULING: the bill is still created at booking — status awaiting_short_miles, $0, linked — and the same engine prices it
-- (status -> open) when the short miles land. This migration only widens the status CHECK; no row is written.
--
-- IDEMPOTENT + FRESH-DB SAFE: to_regclass guard; DROP CONSTRAINT IF EXISTS + ADD; the new list is a superset of the old one,
-- so every existing row satisfies it (ADD CONSTRAINT validates without rewriting).

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_bills') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_bills DROP CONSTRAINT IF EXISTS driver_bills_status_check;
    ALTER TABLE driver_finance.driver_bills
      ADD CONSTRAINT driver_bills_status_check
      CHECK (status = ANY (ARRAY['open'::text, 'approved'::text, 'paid'::text, 'void'::text, 'disputed'::text, 'awaiting_short_miles'::text]));
  END IF;
END $$;

COMMIT;
