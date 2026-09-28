-- B3 (Devin sweep, 2026-09-28; ROUND 203.1, one-time Lead-granted migration-lane exception
-- outside CC-1's usual 00-11 UTC band, quoted verbatim: "CC-1 authors migration 202614540000 now,
-- outside its usual band." Confirmed with Cursor in writing first (docs/bus/NOW-CURSOR.md) that no
-- other seat is authoring a migration in this window.
--
-- FINDING: mdata.workflow_requests (0009_mdata_workflows.sql) has NO operating_company_id column
-- at all, and its SELECT policy admits ANY global Administrator: "identity.is_lucia_bypass() OR
-- requested_by = identity.current_user_id() OR identity.current_user_role() IN ('Owner',
-- 'Administrator')". An Administrator scoped to one company can enumerate and read every other
-- company's workflow requests via GET /api/v1/mdata/workflow-requests and
-- GET /api/v1/mdata/workflow-requests/:id (apps/backend/src/mdata/workflow-routes.ts:264-334),
-- neither of which adds any company-scoping of its own. Entity independence is a hard rule --
-- TRANSP, TRK, USMCA are separate legal entities with different tax IDs and owners.
--
-- MEASURED LIVE before writing this (2026-09-28, bypass_rls='lucia'): mdata.workflow_requests has
-- 0 rows. Backfill below is therefore a real, idempotent no-op today, but is not a no-op migration
-- -- it is written to resolve real rows correctly if any exist by the time this runs, and to REPORT
-- (never silently default) any row whose target resource cannot be resolved to a company. Because
-- today's live count is 0, operating_company_id can safely become NOT NULL in the same migration
-- (conditioned on the backfill leaving zero unresolved rows, checked at runtime, never assumed).
--
-- Resolution rule matches apps/backend/src/mdata/workflow-routes.ts's own callerCanTargetResource
-- exactly: mdata.drivers carries operating_company_id directly; mdata.units/mdata.equipment have no
-- such column, so resolve via COALESCE(currently_leased_to_company_id, owner_company_id) -- the same
-- owner/leased pair used everywhere else in this codebase for these two tables.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / conditional UPDATE ... WHERE ... IS NULL / DROP POLICY IF
-- EXISTS / CREATE INDEX IF NOT EXISTS. Additive only -- CREATE-only, never DROP, per the order.

BEGIN;

ALTER TABLE mdata.workflow_requests
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);

-- Backfill from the target resource. Idempotent (WHERE operating_company_id IS NULL) and safe to
-- re-run; today's live table has 0 rows so all three UPDATEs affect 0 rows.
UPDATE mdata.workflow_requests wr
SET operating_company_id = d.operating_company_id
FROM mdata.drivers d
WHERE wr.target_resource_type = 'driver'
  AND wr.target_resource_id = d.id
  AND wr.operating_company_id IS NULL;

UPDATE mdata.workflow_requests wr
SET operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
FROM mdata.units u
WHERE wr.target_resource_type = 'unit'
  AND wr.target_resource_id = u.id
  AND wr.operating_company_id IS NULL;

UPDATE mdata.workflow_requests wr
SET operating_company_id = COALESCE(e.currently_leased_to_company_id, e.owner_company_id)
FROM mdata.equipment e
WHERE wr.target_resource_type = 'equipment'
  AND wr.target_resource_id = e.id
  AND wr.operating_company_id IS NULL;

-- Report (never default) any row whose target resource no longer exists or is otherwise
-- unresolvable. Only enforce NOT NULL when the backfill above left zero such rows -- a migration
-- that runs later against a non-empty table must not silently force every row through, and must
-- not silently skip the NOT NULL constraint either without saying why.
DO $$
DECLARE
  unresolved int;
BEGIN
  SELECT count(*) INTO unresolved FROM mdata.workflow_requests WHERE operating_company_id IS NULL;
  IF unresolved > 0 THEN
    RAISE NOTICE 'B3: mdata.workflow_requests has % row(s) whose target resource could not be resolved to a company -- left operating_company_id NULL, NOT defaulted to any company. operating_company_id stays nullable until these are resolved by hand.', unresolved;
  ELSE
    RAISE NOTICE 'B3: mdata.workflow_requests has 0 unresolved rows -- setting operating_company_id NOT NULL.';
    ALTER TABLE mdata.workflow_requests ALTER COLUMN operating_company_id SET NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_mdata_workflow_requests_operating_company_id
  ON mdata.workflow_requests (operating_company_id);

-- RLS: same "membership in org.user_company_access is the real check" idiom as
-- org.user_accessible_company_ids() / assertCompanyMembership use everywhere else in this
-- codebase -- Owner keeps cross-entity access by design (that function already returns every
-- active company for an Owner session), an Administrator is now scoped to their own real
-- companies, never every company. No new GUC required at the route layer: this function reads
-- identity.current_user_id()/current_user_role(), both already set by withCurrentUser.

DROP POLICY IF EXISTS mdata_wf_select ON mdata.workflow_requests;
CREATE POLICY mdata_wf_select
ON mdata.workflow_requests
FOR SELECT
USING (
  identity.is_lucia_bypass()
  OR requested_by = identity.current_user_id()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

-- INSERT: the requester must also be a real member of the company the row now carries. The route
-- (callerCanTargetResource) already asserts this before deriving operating_company_id from the
-- target resource; this is the DB-level backstop, not a new behavior for a real caller.
DROP POLICY IF EXISTS mdata_wf_insert ON mdata.workflow_requests;
CREATE POLICY mdata_wf_insert
ON mdata.workflow_requests
FOR INSERT
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    requested_by = identity.current_user_id()
    AND identity.current_user_id() IS NOT NULL
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS mdata_wf_update ON mdata.workflow_requests;
CREATE POLICY mdata_wf_update
ON mdata.workflow_requests
FOR UPDATE
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

-- 0065 grants pattern already covers this table (mdata schema is in 0065's blanket
-- GRANT SELECT/INSERT/UPDATE/DELETE ON ALL TABLES) -- no new GRANT needed here.

COMMIT;
