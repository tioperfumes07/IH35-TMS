-- 202614560000_geocode_precision_google_native_values.sql
-- ============================================================================================================
-- RECONSTRUCTED FROM PRODUCTION 2026-10-03 (CC-1, ROUND 372.2 — docs/bus/10-03-2026-CC-1-ROUND-372-FOUR-RULINGS-AND-THE-MULTI-LOAD-SETTLEMENT-LINE.md)
--   Applied to production: 2026-09-29 01:20:20.439757+00, applied_by neondb_owner, 468 ms (_system._schema_migrations).
--   The original source of this migration was NEVER COMMITTED and could not be found in any checkout, branch or
--   temp directory on this machine (sha256-checked against the ledger checksum).
--   This file is written from production's live catalog (pg_get_constraintdef, direct endpoint, 2026-10-03) and
--   produces exactly that live state; on production it is never re-run (override recorded, citing the ruling above).
--   Object covered: mdata.load_stops CHECK load_stops_geocode_precision_check — widened from the TEL-40b set
--   ('rooftop','range','locality', 202613790000) to also admit Google's native precision values ('ROOFTOP',
--   'RANGE_INTERPOLATED','GEOMETRIC_CENTER','APPROXIMATE'). Without this file a fresh database keeps the narrow
--   TEL-40b check and refuses a value production accepts.
--   Intent was reconstructed from effects. It is listed under "what we cannot prove" in the blueprint (ROUND 366.4).
-- ============================================================================================================
BEGIN;
ALTER TABLE mdata.load_stops DROP CONSTRAINT IF EXISTS load_stops_geocode_precision_check;
ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_geocode_precision_check
  CHECK (((geocode_precision IS NULL) OR (geocode_precision = ANY (ARRAY['rooftop'::text, 'range'::text, 'locality'::text, 'ROOFTOP'::text, 'RANGE_INTERPOLATED'::text, 'GEOMETRIC_CENTER'::text, 'APPROXIMATE'::text]))));
COMMIT;
