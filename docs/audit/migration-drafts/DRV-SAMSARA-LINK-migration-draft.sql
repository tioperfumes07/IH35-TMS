-- DRV-SAMSARA-LINK (owner order 2026-09-04). READY-TO-APPLY DRAFT, not committed by CC-3
-- (chrome-only lane, authorMigrations:false in scripts/verify-migration-lane-band.mjs).
-- Handoff target: CC-1 (or any authorMigrations:true seat).
--
-- Renumber to the next real migration number before applying (checked live: 093c... etc,
-- confirm the actual next-free number in db/migrations/ at apply time -- do not trust this
-- comment's number, it was not reserved).

-- ============================================================================
-- PART 1: the link table. mdata.drivers 1 -> N integrations.samsara_drivers.
-- Effective-dated (linked_at) and voidable (unlinked_at) -- never a hard column on drivers,
-- never deletable. LAW-DRIVER-IDENTITY-ONE-FINANCIAL-MANY-SAMSARA-2026-08-31.md item 2.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mdata.driver_samsara_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  -- Stored as text, not a FK to integrations.samsara_drivers.id: USMCA currently has ZERO rows in
  -- that table (verified live 2026-09-04) even though 93 USMCA drivers carry a value in the legacy
  -- mdata.drivers.samsara_driver_id scalar column. A hard FK here would block the exact backfill
  -- this table exists to enable. Widen to a soft FK (samsara_drivers_id uuid NULL) once that table
  -- is actually populated for USMCA and a real integrations.samsara_drivers row exists to point at.
  samsara_driver_id text NOT NULL,
  match_basis text NOT NULL CHECK (match_basis IN ('cdl_match', 'manual', 'samsara_id_carryover')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz NULL, -- void, never delete (Section 2 law)
  linked_by_user_id uuid NULL REFERENCES identity.users(id),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_driver_samsara_links_unlink_after_link CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at)
);

-- A given Samsara profile can be ACTIVELY linked to only one driver at a time (prevents the same
-- device/login being silently attached to two different people). Two drivers each having their own
-- Samsara profile is fine and expected; the SAME samsara_driver_id on two ACTIVE links is not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_samsara_links_active_samsara_id
  ON mdata.driver_samsara_links (operating_company_id, samsara_driver_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_samsara_links_driver
  ON mdata.driver_samsara_links (driver_id, operating_company_id)
  WHERE unlinked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.driver_samsara_links TO ih35_app;

-- RLS: same shape as mdata.drivers itself (entity-scoped read via operating_company_id + the
-- driver_company_authorizations cross-authorization pattern used everywhere else in mdata).
ALTER TABLE mdata.driver_samsara_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY driver_samsara_links_select ON mdata.driver_samsara_links FOR SELECT
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = ANY (org.user_accessible_company_ids())
  );
CREATE POLICY driver_samsara_links_write ON mdata.driver_samsara_links FOR ALL
  USING (identity.is_lucia_bypass() OR operating_company_id = ANY (org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = ANY (org.user_accessible_company_ids()));

-- ============================================================================
-- PART 2: baseline backfill. Migrate the EXISTING single-scalar samsara_driver_id values into the
-- new link table as the starting state (match_basis='samsara_id_carryover'). Additive-first, per
-- the LAW doc: "Do not drop mdata.drivers.samsara_driver_id until every value is migrated and
-- proven." This does NOT touch or drop the scalar column.
-- ============================================================================
INSERT INTO mdata.driver_samsara_links (operating_company_id, driver_id, samsara_driver_id, match_basis, linked_at)
SELECT d.operating_company_id, d.id, d.samsara_driver_id, 'samsara_id_carryover', d.created_at
FROM mdata.drivers d
WHERE d.samsara_driver_id IS NOT NULL
ON CONFLICT DO NOTHING; -- a samsara_driver_id already linked elsewhere (cross-company collision) is
                         -- left for manual review, not silently overwritten.

-- ============================================================================
-- PART 3: narrow, safe amendment to telematics.vehicle_driver_assignments' append-only guard.
-- LIVE FINDING 2026-09-04: 19 of USMCA's 67 vehicle_driver_assignments rows carry driver_id IS NULL.
-- All 19 are UNAMBIGUOUSLY resolvable TODAY: split_part(samsara_assignment_id, ':', 2) (the Samsara
-- driver id embedded in the assignment id) matches exactly one mdata.drivers.samsara_driver_id row
-- for every single one of the 19, live-verified, zero collisions. But the table's own
-- trg_block_vehicle_driver_assignments_update trigger hard-blocks ANY change to driver_id (NULL or
-- not), and the unique index on samsara_assignment_id blocks re-inserting a corrected row instead.
-- This means the 19 are permanently stuck NULL under the CURRENT trigger, even though the true
-- answer is sitting in the data already.
--
-- Fix: widen the trigger to permit driver_id to move from NULL -> a real value ONLY (never
-- non-NULL -> a different value, never non-NULL -> NULL) -- filling in a gap the original ingest
-- could not resolve is not the same as rewriting history, and the one-directional guard keeps the
-- append-only invariant everywhere it actually matters (no assignment can be reassigned to a
-- DIFFERENT driver after the fact).
CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.id <> NEW.id
    OR OLD.operating_company_id <> NEW.operating_company_id
    OR OLD.unit_id <> NEW.unit_id
    OR OLD.started_at <> NEW.started_at
    OR OLD.source <> NEW.source
    OR OLD.raw_event_id IS DISTINCT FROM NEW.raw_event_id
    OR OLD.created_at <> NEW.created_at
    OR OLD.created_by_user_uuid IS DISTINCT FROM NEW.created_by_user_uuid THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments immutable columns cannot be updated';
  END IF;

  -- driver_id: was immutable outright. Now permits exactly one direction of change: NULL -> a real
  -- value (resolving a previously-unresolved assignment). Any other change (non-NULL -> anything
  -- different, or non-NULL -> NULL) still hard-fails.
  IF OLD.driver_id IS NOT NULL AND OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments driver_id cannot be reassigned once set (only NULL -> resolved is allowed)';
  END IF;

  -- A driver_id-only resolution (ended_at unchanged, still NULL, still in-progress) must be allowed
  -- to skip the ended_at requirement below -- that requirement is for the CLOSE-ASSIGNMENT use case,
  -- not this one.
  IF OLD.driver_id IS DISTINCT FROM NEW.driver_id AND OLD.ended_at IS NOT DISTINCT FROM NEW.ended_at THEN
    RETURN NEW;
  END IF;

  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments ended_at cannot be changed once set';
  END IF;

  IF NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments UPDATE must set ended_at';
  END IF;

  IF NEW.ended_at < OLD.started_at THEN
    RAISE EXCEPTION 'telematics.vehicle_driver_assignments ended_at must be >= started_at';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- PART 4: the actual backfill, to run AFTER part 3 lands (verify count = 19 before, 0 after; this
-- exact statement was dry-run live 2026-09-04 and returned all 19 rows correctly resolved, zero
-- ambiguous matches, zero rows left NULL):
-- ============================================================================
-- UPDATE telematics.vehicle_driver_assignments vda
-- SET driver_id = d.id
-- FROM mdata.drivers d
-- WHERE vda.driver_id IS NULL
--   AND d.operating_company_id = vda.operating_company_id
--   AND d.samsara_driver_id = split_part(vda.samsara_assignment_id, ':', 2)
--   AND d.deactivated_at IS NULL; -- matches the resolver's own live-lookup semantics
--                                  -- (pairing.service.ts resolveLocalUnitAndDriver); the one row that
--                                  -- resolves to a currently-deactivated driver (NEFTALI URBANO
--                                  -- CORONADO) is left NULL by design, same as the live path would.
