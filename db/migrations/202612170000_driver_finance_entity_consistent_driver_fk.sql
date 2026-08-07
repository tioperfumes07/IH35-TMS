-- CLS-JOIN-ENTITY-UNSCOPED / ACCT-F129 — make a cross-entity driver reference IMPOSSIBLE, rather than
-- merely unlikely.
--
-- ROOT CAUSE. Two driver-finance reads join a driver by bare id inside withLuciaBypass, so the FORCE
-- RLS policy that protects the other ~523 join sites is switched OFF for them:
--     driver-finance/settlements.routes.ts:498
--       FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id = s.driver_id
--     driver-finance/cash-advance-owner-approval.service.ts:382
--       FROM driver_finance.cash_advance_requests r JOIN mdata.drivers d ON d.id = r.driver_id
-- Both render driver PII (name, email, phone, identity_user_id); the second is the OWNER-APPROVAL
-- TOKEN path for releasing money. Neither query constrains the driver to the row's own entity, and
-- neither FK does either — both are a bare
--     FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id)
-- so nothing in the database stops a TRANSP settlement from pointing at a USMCA driver.
--
-- VERDICT WAS LATENT, NOT LIVE, AND THAT IS WHY THIS IS THE RIGHT FIX. Verified on prod 2026-08-05
-- (lucia): driver_settlements = 0 rows, cash_advance_requests = 0 rows, cross-entity matches = 0. The
-- leak is UNEXERCISED, not PREVENTED — zero rows is the only reason nothing has leaked. Patching the
-- two SELECTs with AND d.operating_company_id = s.operating_company_id treats the symptom and leaves
-- the next writer free to reintroduce it; the query predicate belongs there too, as defence in depth,
-- but the durable control is the constraint. Doing this while both tables are empty is the cheapest
-- this fix will ever be.
--
-- §1 adds the FK TARGET. mdata.drivers has no UNIQUE (id, operating_company_id) today — verified
-- against pg_indexes — and a composite FK requires one. It is redundant for uniqueness (id is already
-- the primary key) and exists solely so the composite reference is legal; it costs one index.
--
-- §2 adds the composite FKs. Safe by measurement, not by hope: all four referencing columns are
-- NOT NULL, and driver_id/operating_company_id contain zero NULLs across both tables (0 rows), so
-- there is nothing to violate. The pre-existing single-column FKs are LEFT IN PLACE — they are not
-- wrong, merely insufficient, and dropping a live constraint to install a stricter one is a needless
-- window of no enforcement.
--
-- Idempotent throughout (IF NOT EXISTS / catalogue-guarded), and a no-op on prod beyond creating the
-- constraints. No data is written, no row is modified, no load or driver reference is invented.

DO $$
BEGIN
  -- §1 — FK target: UNIQUE (id, operating_company_id) on the drivers hub.
  IF to_regclass('mdata.drivers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_indexes
        WHERE schemaname = 'mdata' AND tablename = 'drivers'
          AND indexname = 'uq_mdata_drivers_id_operating_company'
     ) THEN
    CREATE UNIQUE INDEX uq_mdata_drivers_id_operating_company
      ON mdata.drivers (id, operating_company_id);
    RAISE NOTICE 'ACCT-F129: created uq_mdata_drivers_id_operating_company';
  END IF;
END
$$;

DO $$
BEGIN
  -- §2a — driver_settlements: a settlement may only reference a driver of its OWN entity.
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid = 'driver_finance.driver_settlements'::regclass
          AND conname = 'driver_settlements_driver_entity_fkey'
     ) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_driver_entity_fkey
      FOREIGN KEY (driver_id, operating_company_id)
      REFERENCES mdata.drivers (id, operating_company_id);
    RAISE NOTICE 'ACCT-F129: driver_settlements composite entity FK added';
  END IF;
END
$$;

DO $$
BEGIN
  -- §2b — cash_advance_requests: the owner-approval money path, same rule.
  IF to_regclass('driver_finance.cash_advance_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid = 'driver_finance.cash_advance_requests'::regclass
          AND conname = 'cash_advance_requests_driver_entity_fkey'
     ) THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD CONSTRAINT cash_advance_requests_driver_entity_fkey
      FOREIGN KEY (driver_id, operating_company_id)
      REFERENCES mdata.drivers (id, operating_company_id);
    RAISE NOTICE 'ACCT-F129: cash_advance_requests composite entity FK added';
  END IF;
END
$$;
