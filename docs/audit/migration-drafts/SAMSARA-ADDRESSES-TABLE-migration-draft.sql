-- SAMSARA-ADDRESSES-TABLE (ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT, Step 2). READY-TO-APPLY
-- DRAFT, not committed by CC-3 (no-migrations lane). Handoff target: CC-1 (or any
-- authorMigrations:true seat).
--
-- Renumber to the next real migration number before applying (checked live at draft time;
-- confirm the actual next-free number in db/migrations/ at apply time -- do not trust this
-- comment's number, it is not reserved).

-- ============================================================================
-- WHY (owner, verbatim): "Samsara has 100s of previous geofence." geo.geofences has 2 rows in
-- the whole DB. No integrations.samsara_addresses table exists; the collector only ever polled
-- vehicles + drivers. Without consignee geofences: no arrival -> no delivery event -> no POD
-- prompt -> no invoice conversion -> no factoring packet -> no detention clock -> no tour close.
-- This table is the raw staging mirror (source of truth for what Samsara actually has); the
-- projection into mdata.locations + geo.geofences is separate application code (CC-3's, not this
-- migration) that reads from this table -- same "raw mirror, then project" shape as
-- mdata.qbo_* -> accounting.* elsewhere in this codebase.
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
  -- from this, generating a polygon from centre+radius for circles and storing the radius
  -- alongside so it can be regenerated (migration 0220 requires >=3 vertices).
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

-- FORCED RLS + grants, the 0065 pattern (same shape as integrations.samsara_drivers).
ALTER TABLE integrations.samsara_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS samsara_addresses_entity_select ON integrations.samsara_addresses;
DROP POLICY IF EXISTS samsara_addresses_entity_write ON integrations.samsara_addresses;
CREATE POLICY samsara_addresses_entity_select ON integrations.samsara_addresses FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id = ANY (org.user_accessible_company_ids()));
CREATE POLICY samsara_addresses_entity_write ON integrations.samsara_addresses FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id = ANY (org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id = ANY (org.user_accessible_company_ids()));

GRANT SELECT, INSERT, UPDATE ON integrations.samsara_addresses TO ih35_app;
-- No DELETE grant -- void-not-delete via deactivated_at, matching every other financial/audit-
-- adjacent table in this codebase (integrations schema already in the 0065 schemas[] array, so no
-- ALTER DEFAULT PRIVILEGES needed here).
