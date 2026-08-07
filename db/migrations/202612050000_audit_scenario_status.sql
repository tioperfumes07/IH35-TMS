-- HOMEPAGE LIVE SCENARIO TRACKER §6 — audit.scenario_status: the live certification store.
--
-- WHY
-- The in-app scoreboard reads docs/audit/program-scoreboard.json — a committed snapshot generated
-- once by parsing a markdown ledger. A snapshot is stale the instant anything changes and nothing
-- regenerates it, so the board can show green long after the truth moved. Spec/Built/Merged can be
-- derived live from the repo plus an existence probe, but Proof/Passed/Complete need a QUERYABLE
-- source of verifications — which does not exist while the ledger is markdown. This table is it.
--
-- WORM BY CONSTRUCTION, NOT BY CONVENTION
-- ih35_app gets SELECT only. It is granted NO INSERT, NO UPDATE, NO DELETE on this table, so the
-- application literally cannot rewrite a verification. The only write path is the SECURITY DEFINER
-- function audit.set_scenario_status(), which INSERTs the new current row and supersedes the prior
-- one (is_current=false, superseded_by=<new id>). Corrections SUPERSEDE, never overwrite — the same
-- void-not-delete rule the ledger uses, enforced by grants rather than trusted to callers.
--
-- Note this table stores a verification, never a status the homepage reads back as truth on its own:
-- per §5 Passed/Complete are ALSO gated by a live data predicate, so green cannot outlive the data.
--
-- Additive and idempotent. Creates no GL, posts nothing, touches no existing table.

DO $$
BEGIN
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'org.companies absent — skipping audit.scenario_status';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS audit.scenario_status (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_key         text NOT NULL,
    -- NULL = applies to every entity (a hop that is not per-entity).
    operating_company_id uuid NULL REFERENCES org.companies(id),
    stage                text NOT NULL
      CHECK (stage IN ('spec', 'built', 'merged', 'proof', 'passed', 'complete')),
    state                text NOT NULL DEFAULT 'go'
      CHECK (state IN ('go', 'fix', 'done')),
    -- NOT NULL and non-blank: a green dot with no evidence is exactly the fake-green this replaces.
    evidence             text NOT NULL CHECK (btrim(evidence) <> ''),
    verified_by          text NOT NULL CHECK (verified_by IN ('GUARD', 'CASCADE', 'CI-PROBE')),
    verified_at          timestamptz NOT NULL DEFAULT now(),
    is_current           boolean NOT NULL DEFAULT true,
    is_test_data         boolean NOT NULL DEFAULT false,
    superseded_by        uuid NULL REFERENCES audit.scenario_status(id)
  );
END $$;

-- Current-row lookup for the view and the probes.
CREATE INDEX IF NOT EXISTS scenario_status_key_idx
  ON audit.scenario_status (scenario_key, operating_company_id)
  WHERE is_current;

-- One current row per (scenario, entity) — otherwise "the" current stage is ambiguous and two
-- probes could legitimately disagree about the same dot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scenario_status_one_current
  ON audit.scenario_status (scenario_key, COALESCE(operating_company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_current;

ALTER TABLE audit.scenario_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.scenario_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scenario_status_tenant_scope ON audit.scenario_status;
CREATE POLICY scenario_status_tenant_scope ON audit.scenario_status
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  -- A NULL entity means "all entities" and is visible to every tenant by design.
  OR operating_company_id IS NULL
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id IS NULL
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- The ONLY write path. SECURITY DEFINER so it can supersede the prior row while ih35_app itself
-- holds no INSERT/UPDATE/DELETE on the table.
CREATE OR REPLACE FUNCTION audit.set_scenario_status(
  p_scenario_key text,
  p_operating_company_id uuid,
  p_stage text,
  p_state text,
  p_evidence text,
  p_verified_by text,
  p_is_test_data boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, pg_catalog, public
AS $fn$
DECLARE
  v_new_id uuid;
  v_prior_ids uuid[];
BEGIN
  IF btrim(coalesce(p_evidence, '')) = '' THEN
    RAISE EXCEPTION 'evidence is required — a scenario stage may not be recorded without proof';
  END IF;

  -- Order matters: uq_scenario_status_one_current is enforced at INSERT time, so the prior current
  -- row must stop being current BEFORE the new one is written. (Inserting first fails on the second
  -- transition — caught in rehearsal.) superseded_by is back-filled once the new id exists, so the
  -- supersession chain is still complete and nothing is ever deleted or edited.
  SELECT array_agg(id) INTO v_prior_ids
    FROM audit.scenario_status
   WHERE scenario_key = p_scenario_key
     AND operating_company_id IS NOT DISTINCT FROM p_operating_company_id
     AND is_current;

  IF v_prior_ids IS NOT NULL THEN
    UPDATE audit.scenario_status SET is_current = false WHERE id = ANY(v_prior_ids);
  END IF;

  INSERT INTO audit.scenario_status
    (scenario_key, operating_company_id, stage, state, evidence, verified_by, is_test_data)
  VALUES
    (p_scenario_key, p_operating_company_id, p_stage, p_state, p_evidence, p_verified_by,
     coalesce(p_is_test_data, false))
  RETURNING id INTO v_new_id;

  IF v_prior_ids IS NOT NULL THEN
    UPDATE audit.scenario_status
       SET superseded_by = v_new_id
     WHERE id = ANY(v_prior_ids);
  END IF;

  RETURN v_new_id;
END;
$fn$;

-- security_invoker so the caller's RLS applies to the view exactly as it does to the table.
CREATE OR REPLACE VIEW audit.v_scenario_status_current
WITH (security_invoker = true) AS
SELECT DISTINCT ON (scenario_key, operating_company_id)
       id, scenario_key, operating_company_id, stage, state, evidence, verified_by,
       verified_at, is_current, is_test_data, superseded_by
  FROM audit.scenario_status
 WHERE is_current
 ORDER BY scenario_key, operating_company_id, verified_at DESC;

-- WORM grants: read the table, read the view, write ONLY through the function.
--
-- REVOKE FROM PUBLIC IS LOAD-BEARING — do not delete it. The audit schema carries a DEFAULT
-- PRIVILEGES rule granting PUBLIC `arw` (INSERT, SELECT, UPDATE) on every NEW table, so this table
-- was born writable by anyone and the first rehearsal proved it: a direct INSERT as ih35_app
-- succeeded even though ih35_app itself held only SELECT. Revoking the named role is not enough;
-- the privilege arrives through PUBLIC. (The pre-existing WORM tables audit.audit_events and
-- audit.row_changes carry only `=ar` — append-but-never-modify — so the `w` in the DEFAULT rule is
-- drift, reported separately.)
REVOKE ALL ON audit.scenario_status FROM PUBLIC;
GRANT SELECT ON audit.scenario_status TO ih35_app;
GRANT SELECT ON audit.v_scenario_status_current TO ih35_app;
REVOKE INSERT, UPDATE, DELETE ON audit.scenario_status FROM ih35_app;
GRANT EXECUTE ON FUNCTION audit.set_scenario_status(text, uuid, text, text, text, text, boolean) TO ih35_app;

COMMENT ON TABLE audit.scenario_status IS
  'Live certification store for the homepage scenario tracker. Append-only/WORM: ih35_app holds '
  'SELECT only and writes exclusively through audit.set_scenario_status(), which supersedes rather '
  'than overwrites. Stages are still gated by live data predicates at read time — a cert row alone '
  'never turns a dot green.';
