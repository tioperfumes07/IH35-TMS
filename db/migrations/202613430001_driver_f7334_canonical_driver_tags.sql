-- DRIVER-F7334-ROSTER-TAG-HAS-NO-CANONICAL-MODEL (docs/audit/GUARD-WORKORDERS.md, routed=CC-3).
-- The Drivers roster's bulk "Tag" action was disabled because no canonical driver-tag table,
-- company-scoped writer, read model, or filter existed. This adds the two-table shape: a
-- company-scoped tag catalog (catalogs.driver_tags) and an append-only membership join
-- (mdata.driver_tag_memberships). Tag removal ARCHIVES the membership row (removed_at set) --
-- it is never deleted, so driver tag history is permanent (void-not-delete).
-- Additive, idempotent, no data touched. No GL/money impact.
--
-- CC-3 handoff (cross-session, 2026-09-02): CC-3's backend/frontend (DriversTable.tsx Tag button +
-- Tags column + filter)/guard are already built and applied live, barred from carrying this file
-- itself by verify-migration-lane-band.mjs.
--
-- MAJOR systemic finding folded in (not in CC-3's original text): CC-3 flagged that the same
-- PUBLIC-default-ACL drift found on `maintenance` (GO-20 slice B, migration 202613410001) also
-- exists on `mdata`. Checked live before writing this: the drift is present on 20 schemas total --
-- reporting, dispatch, qbo_archive, forecast, legal, qbo, documents, owner, analytics, email, docs,
-- notifications, tasks, master_data, mdata, maintenance, alerts, settlement, integrations, catalogs.
-- Every one of those has an ALTER DEFAULT PRIVILEGES entry auto-granting PUBLIC arwd (all 4
-- privileges) on every NEW table created in it. Confirmed exhaustively via
-- information_schema.role_table_grants that ZERO existing tables across all 20 schemas currently
-- carry a live PUBLIC grant -- this is a forward-looking hole only (the next new table in any of
-- these schemas would inherit it), not a retroactive exposure needing separate remediation. Closed
-- at the schema-default level for all 20 (maintenance was already closed in 202613410001; the other
-- 19 are closed here). Idempotent -- REVOKE on an already-revoked default is a safe no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.driver_tags (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  code                  text NOT NULL,
  label                 text NOT NULL,
  color                 text NULL,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid NULL REFERENCES identity.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_tags_company_code
  ON catalogs.driver_tags (operating_company_id, code)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS mdata.driver_tag_memberships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  driver_id             uuid NOT NULL REFERENCES mdata.drivers(id),
  tag_id                uuid NOT NULL REFERENCES catalogs.driver_tags(id),
  assigned_at           timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id   uuid NULL REFERENCES identity.users(id),
  removed_at            timestamptz NULL,
  removed_by_user_id    uuid NULL REFERENCES identity.users(id),
  removed_reason        text NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_tag_membership_active
  ON mdata.driver_tag_memberships (operating_company_id, driver_id, tag_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_driver_tag_memberships_driver
  ON mdata.driver_tag_memberships (operating_company_id, driver_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_driver_tag_memberships_tag
  ON mdata.driver_tag_memberships (operating_company_id, tag_id)
  WHERE removed_at IS NULL;

ALTER TABLE catalogs.driver_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.driver_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_tags_company_isolation ON catalogs.driver_tags;
CREATE POLICY driver_tags_company_isolation ON catalogs.driver_tags
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

ALTER TABLE mdata.driver_tag_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_tag_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_tag_memberships_company_isolation ON mdata.driver_tag_memberships;
CREATE POLICY driver_tag_memberships_company_isolation ON mdata.driver_tag_memberships
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON catalogs.driver_tags TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.driver_tag_memberships TO ih35_app;

REVOKE DELETE ON catalogs.driver_tags FROM ih35_app;
REVOKE ALL ON catalogs.driver_tags FROM PUBLIC;
REVOKE DELETE ON mdata.driver_tag_memberships FROM ih35_app;
REVOKE ALL ON mdata.driver_tag_memberships FROM PUBLIC;

COMMENT ON TABLE catalogs.driver_tags IS 'DRIVER-F7334 -- company-scoped driver tag catalog (roster bulk Tag action).';
COMMENT ON TABLE mdata.driver_tag_memberships IS 'DRIVER-F7334 -- append-only driver-tag membership. removed_at archives a membership; rows are never deleted.';

-- Systemic grant-drift fix (19 schemas -- maintenance already closed in 202613410001).
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA dispatch REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA qbo_archive REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA forecast REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA legal REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA qbo REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA documents REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA owner REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA email REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA docs REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA notifications REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA tasks REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA mdata REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA alerts REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA settlement REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA integrations REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalogs REVOKE ALL ON TABLES FROM PUBLIC;

COMMIT;
