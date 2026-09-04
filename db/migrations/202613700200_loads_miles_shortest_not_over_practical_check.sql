BEGIN;

-- LOAD-COSTS-COMPLETE money item (7) (owner order 2026-09-04, verbatim): "shortest <= practical
-- CHECK on mdata.loads. It exists on catalogs.lane_mileage and catalogs.point_mileage and NOT on
-- the table that pays the driver."
--
-- catalogs.lane_mileage already carries lane_mileage_short_miles_not_over_practical
-- (CHECK (short_miles IS NULL OR short_miles <= practical_miles), migration 202613680001) and
-- catalogs.point_mileage carries the analogous point-to-point check. mdata.loads.miles_shortest /
-- miles_practical -- the ACTUAL figures a driver's per-mile settlement pay is computed from
-- (driver_finance.driver_bills.miles_basis / miles_basis_type) -- had only independent >= 0
-- checks (loads_miles_shortest_check / loads_miles_practical_check), never a cross-column
-- ordering check. A shortest-route figure can never legitimately exceed the practical-route
-- figure for the same trip (shortest is, by definition, the shorter or equal of the two); a row
-- where it does is bad mileage data reaching the exact table that decides driver pay, silently.
--
-- Live-verified before writing this migration (bypass_rls): 6 total mdata.loads rows, 0 with
-- miles_shortest > miles_practical -- safe to add without violating existing data.
--
-- Byte-shape matches lane_mileage's own constraint (NULL-permissive, <=, not <) so a load that
-- only has one of the two figures populated (the normal booking-time state) is never blocked.
--
-- Idempotent: ADD CONSTRAINT guarded to skip if already present.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_miles_shortest_not_over_practical'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_miles_shortest_not_over_practical
      CHECK (miles_shortest IS NULL OR miles_practical IS NULL OR miles_shortest <= miles_practical);
  END IF;
END
$$;

COMMENT ON CONSTRAINT loads_miles_shortest_not_over_practical ON mdata.loads IS
  'LOAD-COSTS-COMPLETE item (7) (2026-09-04): a shortest-route mileage figure can never exceed the practical-route figure for the same trip. Mirrors catalogs.lane_mileage_short_miles_not_over_practical / the analogous catalogs.point_mileage check -- this is the table those upstream figures ultimately feed into driver pay through (driver_finance.driver_bills.miles_basis).';

COMMIT;
