-- 202616120700_fuel_transactions_unit_fks.sql  (CC-2, claimed on main first in #27140 — 443.214 follow-up)
-- 202616070700 (443.214) added fuel.fuel_transactions.card_unit_id / gps_unit_id (the card's truck and the truck GPS put at the
-- pump) without a FOREIGN KEY; verify-orphan-fk-inventory went red on main. Both always name a row of mdata.units.
-- MEASURED on prod (10-22 02:55Z, read-only, bypass): card_unit_id set 87 / orphan 0; gps_unit_id set 86 / orphan 0.
-- NOT VALID + VALIDATE: the ADD takes a brief lock only; VALIDATE scans without blocking writes.
-- IDEMPOTENT + FRESH-DB SAFE: to_regclass guards; each constraint added only when absent.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL AND to_regclass('mdata.units') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_transactions_card_unit_id_fkey'
                     AND conrelid = 'fuel.fuel_transactions'::regclass) THEN
      ALTER TABLE fuel.fuel_transactions
        ADD CONSTRAINT fuel_transactions_card_unit_id_fkey FOREIGN KEY (card_unit_id) REFERENCES mdata.units(id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_transactions_gps_unit_id_fkey'
                     AND conrelid = 'fuel.fuel_transactions'::regclass) THEN
      ALTER TABLE fuel.fuel_transactions
        ADD CONSTRAINT fuel_transactions_gps_unit_id_fkey FOREIGN KEY (gps_unit_id) REFERENCES mdata.units(id) NOT VALID;
    END IF;
    ALTER TABLE fuel.fuel_transactions VALIDATE CONSTRAINT fuel_transactions_card_unit_id_fkey;
    ALTER TABLE fuel.fuel_transactions VALIDATE CONSTRAINT fuel_transactions_gps_unit_id_fkey;
  END IF;
END $$;

COMMIT;
