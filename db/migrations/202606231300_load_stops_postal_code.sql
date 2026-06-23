-- render-v6 §C "Zip Code" field for load stops.
--
-- mdata.load_stops already carries address_line1 / city / state / country and a Mexico-specific
-- mx_postal_code, but no general US/generic postal (ZIP) code. This adds one, distinct from
-- mx_postal_code, so the §C "Zip Code" field can round-trip with ZERO fabrication.
--
-- Additive, nullable, no backfill, no default that implies data. mdata is covered by migration 0065
-- default privileges, so ih35_app inherits column access (grants are table-level). load_stops already
-- has its audit row trigger; a new column needs no further wiring. Idempotent.

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS postal_code text;
