-- GO-19-2b Section 5 (owner 2026-09-03): the mileage table is OURS -- keyed by GEOGRAPHY, not city
-- text, computed once and reused forever. We own the engine (self-hosted OSM routing per Section
-- 3), so there is no licence clock on storage, unlike Google Maps (§19.3 caps caching at 30 days).
--
-- Deadhead lanes and loaded lanes go in the SAME table: a distance between two points does not
-- care whether the trailer is loaded.
--
-- CANONICAL-CHECK: idempotent, CREATE-only. No RLS needed -- this is coordinate-keyed reference
-- data (a distance between two points), not tenant-scoped by design (same as catalogs.lane_mileage
-- being entity-neutral reference mileage, owner ruling 2026-09-03).

BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.point_mileage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_lat numeric(8,4) NOT NULL,
  origin_lng numeric(8,4) NOT NULL,
  dest_lat numeric(8,4) NOT NULL,
  dest_lng numeric(8,4) NOT NULL,
  practical_miles numeric(8,1) NOT NULL,
  shortest_miles numeric(8,1),
  engine text NOT NULL,
  engine_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_mileage_shortest_not_over_practical
    CHECK (shortest_miles IS NULL OR shortest_miles <= practical_miles)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_mileage_coords
  ON catalogs.point_mileage (origin_lat, origin_lng, dest_lat, dest_lng);

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT ON catalogs.point_mileage TO ih35_app;

COMMIT;
