-- 202616070700_fuel_gps_truck_columns.sql  (CC-2, claimed on main first — LEAD 443.214)
-- OWNER (5:09 PM CT 10-21): "all wex transactions should be linked to a load, use samsara locations, geofences, etc. ...
-- check dates, and time should be in the reports."
--
-- MEASURED (prod, 10-21): 784 of 856 live USMCA fuel rows carry a PLACEHOLDER time (12:00Z = 07:00 CT, the settlement-typed
-- date); the real moment exists only on the provider record (Relay relay_created_at, the WEX / Dreamline statement line).
-- The fill's truck was the card's unit label and its load came from that placeholder — not where the truck actually was.
--
-- Evidence columns on fuel.fuel_transactions, written ONLY by apps/backend/src/fuel/fill-truck-and-load.service.ts:
--   fill_moment_at / fill_moment_source  — the provider's real pump moment ('relay', 'wex_statement', 'dreamline_statement',
--                                          'statement_row'); NULL + time_unknown = true when no rail has one (never 07:00)
--   station_lat / station_lng            — the station's coordinates (Relay location, else the Love's store dictionary)
--   card_unit_id                         — the unit the card / document named (kept when GPS disagrees)
--   gps_unit_id / gps_distance_m / gps_minutes_off — the truck Samsara put at the pump
--   truck_resolution / load_resolution   — why: gps | gps_card_among | card_only_no_gps | held_* ; running | next_load | held_*
--   resolved_at                          — when the engine last decided
-- IDEMPOTENT + FRESH-DB SAFE: ADD COLUMN IF NOT EXISTS; no data written.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS fill_moment_at timestamptz,
  ADD COLUMN IF NOT EXISTS fill_moment_source text,
  ADD COLUMN IF NOT EXISTS time_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS station_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS station_lng numeric(9,6),
  ADD COLUMN IF NOT EXISTS card_unit_id uuid,
  ADD COLUMN IF NOT EXISTS gps_unit_id uuid,
  ADD COLUMN IF NOT EXISTS gps_distance_m integer,
  ADD COLUMN IF NOT EXISTS gps_minutes_off integer,
  ADD COLUMN IF NOT EXISTS truck_resolution text,
  ADD COLUMN IF NOT EXISTS load_resolution text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

COMMENT ON COLUMN fuel.fuel_transactions.fill_moment_at IS
  'LEAD 443.214: the provider''s real pump moment (Relay / WEX / Dreamline statement). transaction_at on settlement-entered rows is a typed DATE (07:00 CT placeholder) and is never used to place the truck.';
COMMENT ON COLUMN fuel.fuel_transactions.gps_unit_id IS
  'LEAD 443.214: the truck Samsara GPS put at the station within 0.3 mi / ±20 min of fill_moment_at (fill-truck-and-load.service.ts). Wins over the card''s unit label; card_unit_id keeps the label.';

COMMIT;
