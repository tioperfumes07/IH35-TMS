-- CLAIM-RESERVE 202613760001 (merged #20433). STEP 0 of
-- 09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md: three ready-to-apply drafts
-- authored by CC-3 (no migration authority in that lane) under
-- ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT, applied here by CC-1 as ONE batch, reproduced
-- verbatim from docs/audit/migration-drafts/ (root-cause comments preserved, only renumbered).
-- Three seats (CC-3's own geofence-import collector, CC-1's own step 1.11, Cursor's C.6) are gated
-- on these tables/columns existing.

-- ============================================================================
-- PART 1 — SAMSARA-REMOTE-COUNTS-ADDRESSES-ENTITY-TYPE
-- ROOT CAUSE (verified live, tiny-field-89581227, 2026-09-04): integrations.samsara_remote_counts
-- has CHECK (entity_type = ANY (ARRAY['drivers','vehicles'])). The collector code widens
-- SamsaraRemoteEntityType to include "addresses" (Step 1 of the ORDER -- "Samsara has 100s of
-- previous geofence... nobody asked for addresses"), but the INSERT will hard-fail against this
-- constraint until it is widened too. Additive/safe: existing rows are unaffected, only a new value
-- becomes legal.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('integrations.samsara_remote_counts') IS NOT NULL THEN
    ALTER TABLE integrations.samsara_remote_counts DROP CONSTRAINT IF EXISTS samsara_remote_counts_entity_type_check;
    ALTER TABLE integrations.samsara_remote_counts ADD CONSTRAINT samsara_remote_counts_entity_type_check
      CHECK (entity_type = ANY (ARRAY['drivers'::text, 'vehicles'::text, 'addresses'::text]));
  END IF;
END $$;

-- ============================================================================
-- PART 2 — SAMSARA-ADDRESSES-TABLE
-- WHY (owner, verbatim): "Samsara has 100s of previous geofence." geo.geofences has 2 rows in the
-- whole DB. No integrations.samsara_addresses table exists; the collector only ever polled vehicles
-- + drivers. Without consignee geofences: no arrival -> no delivery event -> no POD prompt -> no
-- invoice conversion -> no factoring packet -> no detention clock -> no tour close. This table is
-- the raw staging mirror (source of truth for what Samsara actually has); the projection into
-- mdata.locations + geo.geofences is separate application code (CC-3's, not this migration) that
-- reads from this table -- same "raw mirror, then project" shape as mdata.qbo_* -> accounting.*
-- elsewhere in this codebase.
-- ============================================================================
CREATE TABLE IF NOT EXISTS integrations.samsara_addresses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  samsara_address_id     text NOT NULL,
  name                   text NULL,
  formatted_address      text NULL,
  lat                    double precision NULL,
  lng                    double precision NULL,
  -- Samsara's own geofence shape, verbatim (circle radius or polygon vertices) -- the ORDER is
  -- explicit: "Bring it. Do not redraw it." Projection code derives geo.geofences.vertices_json
  -- from this, generating a polygon from centre+radius for circles and storing the radius alongside
  -- so it can be regenerated (migration 0220 requires >=3 vertices).
  geofence_json          jsonb NULL,
  tags                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                  text NULL,
  raw_json               jsonb NOT NULL,
  synced_at              timestamptz NOT NULL DEFAULT now(),
  -- Void-not-delete: "Nothing is ever deleted" (ORDER Step 4). Deactivate later on evidence a
  -- location never fires on a live load -- never on a guess, never at import time.
  deactivated_at         timestamptz NULL,
  deactivated_reason     text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Idempotent on samsara_address_id (ORDER: "re-run never duplicates"), scoped per company since
  -- the same Samsara org can theoretically be re-keyed per tenant the way samsara_drivers is.
  CONSTRAINT uq_samsara_addresses_company_address UNIQUE (operating_company_id, samsara_address_id)
);

CREATE INDEX IF NOT EXISTS idx_samsara_addresses_company
  ON integrations.samsara_addresses (operating_company_id, synced_at DESC)
  WHERE deactivated_at IS NULL;

-- FORCED RLS + grants. CC-3's own draft proposed `identity.is_lucia_bypass() OR operating_company_id
-- = ANY (org.user_accessible_company_ids())`, citing "same shape as integrations.samsara_drivers" --
-- verified LIVE this pass that samsara_drivers' actual policy uses a DIFFERENT, proven pattern, and
-- that org.user_accessible_company_ids() is a SET-RETURNING function (proretset=true), which Postgres
-- forbids inside a bare `= ANY(...)` policy expression ("set-returning functions are not allowed in
-- policy expressions" -- confirmed by a live rejected apply attempt this pass). Using the actual live
-- pattern instead (matches integrations.samsara_drivers AND accounting.chart_of_accounts_roles,
-- verified live on both), which does not have this bug. Filed back to CC-3 as a finding.
ALTER TABLE integrations.samsara_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS samsara_addresses_entity_select ON integrations.samsara_addresses;
DROP POLICY IF EXISTS samsara_addresses_entity_write ON integrations.samsara_addresses;
CREATE POLICY samsara_addresses_entity_select ON integrations.samsara_addresses FOR SELECT
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
         OR current_setting('app.bypass_rls', true) = 'lucia');
CREATE POLICY samsara_addresses_entity_write ON integrations.samsara_addresses FOR ALL
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
         OR current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
         OR current_setting('app.bypass_rls', true) = 'lucia');

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_addresses TO ih35_app;
-- No DELETE grant -- void-not-delete via deactivated_at, matching every other financial/audit-
-- adjacent table in this codebase (integrations schema already in the 0065 schemas[] array, so no
-- ALTER DEFAULT PRIVILEGES needed here).

-- ============================================================================
-- PART 3 — GEO-GEOFENCES-SAMSARA-SOURCE-ID
-- ROOT CAUSE (verified live, tiny-field-89581227, 2026-09-04): geo.geofences has no column to carry
-- a Samsara address id, and its `source` column is CHECK-constrained to ('manual', 'auto_dispatch')
-- only (0224_cap2_auto_geofence_source.sql). The ORDER is explicit: "source = Samsara +
-- samsara_address_id — never lose the link" -- that needs a real column, not encoding an id into
-- the constrained `source` enum-like field (which the CHECK would reject outright). One of the
-- ORDER's three required guards is literally verify-geofence-carries-samsara-source-id -- this
-- migration is what that guard checks for.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('geo.geofences') IS NOT NULL THEN
    ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS samsara_address_id text NULL;

    CREATE INDEX IF NOT EXISTS ix_geo_geofences_samsara_address_id
      ON geo.geofences (operating_company_id, samsara_address_id)
      WHERE samsara_address_id IS NOT NULL;

    ALTER TABLE geo.geofences DROP CONSTRAINT IF EXISTS geo_geofences_source_check;
    ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_source_check
      CHECK (source = ANY (ARRAY['manual'::text, 'auto_dispatch'::text, 'samsara_import'::text]));

    -- A samsara_import-sourced geofence must always carry the id it came from (the guard's whole
    -- point -- never lose the link); manual/auto_dispatch rows are unaffected (samsara_address_id
    -- stays NULL for them, which is correct, not a gap).
    ALTER TABLE geo.geofences DROP CONSTRAINT IF EXISTS geo_geofences_samsara_source_requires_id;
    ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_samsara_source_requires_id
      CHECK (source <> 'samsara_import' OR samsara_address_id IS NOT NULL);
  END IF;
END $$;
