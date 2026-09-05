-- GEO-GEOFENCES-SAMSARA-SOURCE-ID (ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT, Step 2/Guards).
-- READY-TO-APPLY DRAFT, not committed by CC-3 (no-migrations lane). Handoff target: CC-1.
--
-- Renumber to the next real migration number before applying (checked live at draft time;
-- confirm the actual next-free number in db/migrations/ at apply time -- do not trust this
-- comment's number, it is not reserved).

-- ============================================================================
-- ROOT CAUSE (verified live, tiny-field-89581227, 2026-09-04): geo.geofences has no column to
-- carry a Samsara address id, and its `source` column is CHECK-constrained to
-- ('manual', 'auto_dispatch') only (0224_cap2_auto_geofence_source.sql). The ORDER is explicit:
-- "source = Samsara + samsara_address_id — never lose the link" -- that needs a real column, not
-- encoding an id into the constrained `source` enum-like field (which the CHECK would reject
-- outright). One of the ORDER's three required guards is literally
-- verify-geofence-carries-samsara-source-id -- this migration is what that guard checks for.
-- ============================================================================
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS samsara_address_id text NULL;

CREATE INDEX IF NOT EXISTS ix_geo_geofences_samsara_address_id
  ON geo.geofences (operating_company_id, samsara_address_id)
  WHERE samsara_address_id IS NOT NULL;

ALTER TABLE geo.geofences DROP CONSTRAINT geo_geofences_source_check;
ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'auto_dispatch'::text, 'samsara_import'::text]));

-- A samsara_import-sourced geofence must always carry the id it came from (the guard's whole
-- point -- never lose the link); manual/auto_dispatch rows are unaffected (samsara_address_id
-- stays NULL for them, which is correct, not a gap).
ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_samsara_source_requires_id
  CHECK (source <> 'samsara_import' OR samsara_address_id IS NOT NULL);
