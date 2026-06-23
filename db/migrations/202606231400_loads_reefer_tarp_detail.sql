-- render-v6 §B reefer + tarp detail for loads.
--
-- mdata.loads already has reefer_setpoint_temp_f (the "Reefer setpoint" field) and requires_tarps (the
-- "Tarp required?" equipment toggle). This adds the remaining render-v6 §B conditional-detail fields so
-- they round-trip with ZERO fabrication:
--   reefer block (revealed only for a reefer trailer):  reefer_temp_f, reefer_mode, pre_cool_temp_f
--   tarp block   (revealed only for a flatbed):         tarp_qty, tarp_size
-- ("Tarp required?" reuses the existing requires_tarps flag — no new column.)
--
-- Additive, nullable, no backfill, no default that implies data. mdata is covered by migration 0065
-- default privileges, so ih35_app inherits column access. mdata.loads already has its audit row trigger.
-- Migration number > current max. Idempotent.

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS reefer_temp_f numeric,
  ADD COLUMN IF NOT EXISTS reefer_mode   text,
  ADD COLUMN IF NOT EXISTS pre_cool      boolean,   -- render-v6 Pre-cool = Yes/No
  ADD COLUMN IF NOT EXISTS tarp_qty      integer,
  ADD COLUMN IF NOT EXISTS tarp_size     text;
