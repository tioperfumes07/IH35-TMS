BEGIN;

-- LANE-MILEAGE-LIVE-CONSTRAINTS-BLOCK-OWNER-RULING (CC-3 finding 2026-09-04, GUARD-WORKORDERS.md,
-- routed to CC-1/Cursor). Two live catalogs.lane_mileage constraints block a full, corrected
-- re-import of the owner's real source (db/seeds/lane-mileage-usmca.csv) and are incompatible with
-- the owner's own 2026-09-04 ruling on this data.
--
-- (1) practical_miles NOT NULL rejects 26 real source rows that were observed only via a
-- short-route data point (e.g. ADRIAN,PA -> LAREDO,TX: blank practical, short_miles=338.4,
-- n_short=1). These are real, honest gaps in the source -- not something to fabricate a practical
-- value for. Dropping NOT NULL lets the importer hold them as NULL (never invented) instead of
-- skipping the row entirely.
--
-- (2) CHECK lane_mileage_short_miles_not_over_practical (short_miles IS NULL OR short_miles <=
-- practical_miles) assumed short can never exceed practical. The owner's ruling
-- (docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md, "AlwaysTrack 'loaded' = shortest loaded +
-- deadhead") is the opposite: short legitimately exceeds practical whenever the source's short_miles
-- column is carrying that blend, verified live matching the owner's own cited counts (2,203 of
-- 3,335 lanes with both values, median ratio 1.067). MILES-INVERT-01 (migration 202613500001,
-- already live) exists PRECISELY to handle this shape -- it flags short_miles_untrustworthy on
-- short>practical (or a reverse-lane disagreement) rather than rejecting the row, and the booking
-- wizard already shows a non-blocking operator-ack popup on that flag (BookLoadModalV4.tsx,
-- MilesInvertAck). This older CHECK constraint predates MILES-INVERT-01's design and now
-- contradicts it -- a lane the trust-flag trigger is built to correctly FLAG can never actually be
-- written while this CHECK is live. No replacement bound is defensible here: short and practical
-- are independent measures in this data, and any formula relating them (e.g. capping short at
-- practical, or deriving it from empty_miles) would fabricate a number that feeds driver pay --
-- explicitly forbidden by the owner ("Any formula would fabricate driver pay" / "Never derive one
-- mileage from another").
--
-- Neither change is destructive: dropping a NOT NULL or a CHECK constraint only widens what CAN be
-- stored -- it cannot invalidate any row that already satisfies the old, stricter rule. Existing
-- data is untouched by this migration; only future writes at the boundaries described above are
-- affected. No backfill, no data write of any kind in this file.

ALTER TABLE catalogs.lane_mileage
  ALTER COLUMN practical_miles DROP NOT NULL;

ALTER TABLE catalogs.lane_mileage
  DROP CONSTRAINT IF EXISTS lane_mileage_short_miles_not_over_practical;

COMMENT ON COLUMN catalogs.lane_mileage.practical_miles IS
  'Loaded practical route miles. Nullable since 2026-09-04 (LANE-MILEAGE-LIVE-CONSTRAINTS-BLOCK-OWNER-RULING) -- a real source lane can be observed via a short-route data point only, with no practical figure yet; NULL is the honest state, never fabricated.';

COMMIT;
