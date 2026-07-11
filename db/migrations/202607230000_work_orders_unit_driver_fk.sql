-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- P4-06 (WO-FK) — cross-module linkage: enforce work_orders -> unit/driver.
-- GUARD+AGENT-confirmed (pg_constraint): maintenance.work_orders.unit_id and driver_id are unconstrained
-- uuids (no FK) — a WO can reference a nonexistent unit/driver (Total Connectivity §10a break). This adds
-- FK unit_id -> mdata.units(id) + driver_id -> mdata.drivers(id) (both canonical hubs) as NOT VALID
-- (enforces NEW rows without failing on any pre-existing orphan; GUARD runs the 0-orphan check + VALIDATE
-- on the Neon branch). Additive, idempotent (pg_constraint guard). FORCED RLS + grants unchanged.
-- NOTE (deferred, in the block): work_orders.vendor_id points at the mdata.qbo_vendors MIRROR, not the
-- canonical AP truth mdata.vendors — repointing that writer + its FK is a coordinated follow-up (depends
-- on the vendor-namespace work / item 18); NOT touched here. Tier-1 — build-and-hold.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_unit_id_fkey') THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_driver_id_fkey') THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id) NOT VALID;
  END IF;
END
$$;

COMMIT;
