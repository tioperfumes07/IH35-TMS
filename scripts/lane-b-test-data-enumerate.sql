-- ============================================================================================
-- LANE B · STEP 1 — IDENTIFY test/demo units + trailers + loads (READ-ONLY, NO WRITES)
-- GUARD-CODER-TEST-DATA-INACTIVATE-2026-06-24. Run by JORGE on prod (read-only). Coder validated
-- the SQL against the full migrated schema (ih35_e2e) — it compiles and is side-effect-free.
--
-- WHY THIS SHAPE: there is NO is_test / is_demo / seed_source flag column on mdata.units or
-- mdata.equipment (verified against every migration). So test/demo data is identified ONLY by:
--   (a) naming convention — unit_number / equipment_number / load_number starting DEMO-/TEST-, and
--   (b) the known demo unit id prefixes Jorge gave: 6119f024…, 96e1f233….
-- Because there is no flag, REVIEW THE LIST before any inactivation — naming can miss/over-catch.
--
-- HARD EXCLUSIONS (per Jorge): the 2 REAL Dispatch company vehicles + T139 + the Dispatch loads are
-- NEVER candidates. T139 = L-20260616-0122, load id 79761ac9-d526-426f-9c4b-86f8fe8d69f7. The 2 real
-- Dispatch vehicles are derived live = the assigned_unit_id of the loads currently on the Dispatch
-- board (active states). Section 0 prints exactly what is excluded, so the exclusion is visible.
-- Entity scope = TRANSP (operating_company_id resolved by code).
-- ============================================================================================

\set ON_ERROR_STOP on
SELECT id AS transp_id FROM org.companies WHERE code = 'TRANSP' LIMIT 1 \gset
SET ROLE ih35_app;
BEGIN;                                   -- read-only txn; ends in ROLLBACK (no writes can persist)
SELECT set_config('app.bypass_rls', 'lucia', true);              -- read across the entity for the report
SELECT set_config('app.operating_company_id', :'transp_id', true); -- register the GUC (RLS policies read it)

WITH transp AS (
  SELECT id AS company_id FROM org.companies WHERE code = 'TRANSP' LIMIT 1
),
-- Loads currently on the Dispatch board (real, active) → their trucks are the REAL vehicles to protect.
dispatch_board_loads AS (
  SELECT l.id AS load_id, l.load_number, l.assigned_unit_id
  FROM mdata.loads l, transp t
  WHERE l.operating_company_id = t.company_id
    AND l.soft_deleted_at IS NULL
    AND l.status::text IN ('assigned_not_dispatched','dispatched','in_transit','delivered_pending_docs','at_pickup','loaded','at_delivery')
),
-- Units to PROTECT: the active-board trucks + T139's truck. NEVER inactivate these.
excluded_real_units AS (
  SELECT DISTINCT assigned_unit_id AS unit_id
  FROM dispatch_board_loads
  WHERE assigned_unit_id IS NOT NULL
  UNION
  SELECT assigned_unit_id FROM mdata.loads
  WHERE id = '79761ac9-d526-426f-9c4b-86f8fe8d69f7'::uuid AND assigned_unit_id IS NOT NULL
),
-- Candidate test/demo TRUCKS (mdata.units): naming OR known demo-id prefixes, scoped to TRANSP,
-- minus the protected real units.
candidate_units AS (
  SELECT u.id, u.unit_number, u.vin, u.status::text AS status, u.deactivated_at, u.created_at,
         CASE
           WHEN u.id::text LIKE '6119f024%' OR u.id::text LIKE '96e1f233%' THEN 'known-demo-id'
           WHEN upper(u.unit_number) LIKE 'DEMO%' OR upper(u.unit_number) LIKE 'TEST%' THEN 'name-prefix'
           WHEN upper(COALESCE(u.vin,'')) LIKE '%TEST%' OR upper(COALESCE(u.vin,'')) LIKE '%DEMO%' THEN 'vin-marker'
         END AS marker_reason
  FROM mdata.units u, transp t
  WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = t.company_id
    AND u.id NOT IN (SELECT unit_id FROM excluded_real_units)
    AND (
      u.id::text LIKE '6119f024%' OR u.id::text LIKE '96e1f233%'
      OR upper(u.unit_number) LIKE 'DEMO%' OR upper(u.unit_number) LIKE 'TEST%'
      OR upper(COALESCE(u.vin,'')) LIKE '%TEST%' OR upper(COALESCE(u.vin,'')) LIKE '%DEMO%'
    )
),
-- Candidate test/demo TRAILERS (mdata.equipment): naming markers, scoped to TRANSP.
candidate_equipment AS (
  SELECT e.id, e.equipment_number, e.vin, e.equipment_type, e.status::text AS status, e.deactivated_at, e.created_at,
         CASE
           WHEN upper(e.equipment_number) LIKE 'DEMO%' OR upper(e.equipment_number) LIKE 'TEST%' THEN 'name-prefix'
           WHEN upper(COALESCE(e.vin,'')) LIKE '%TEST%' OR upper(COALESCE(e.vin,'')) LIKE '%DEMO%' THEN 'vin-marker'
         END AS marker_reason
  FROM mdata.equipment e, transp t
  WHERE COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = t.company_id
    AND (upper(e.equipment_number) LIKE 'DEMO%' OR upper(e.equipment_number) LIKE 'TEST%'
         OR upper(COALESCE(e.vin,'')) LIKE '%TEST%' OR upper(COALESCE(e.vin,'')) LIKE '%DEMO%')
),
-- Candidate test/demo LOADS (mdata.loads): naming markers, scoped to TRANSP, EXCLUDING T139 and any
-- load currently on the Dispatch board.
candidate_loads AS (
  SELECT l.id, l.load_number, l.status::text AS status, l.soft_deleted_at, l.created_at,
         l.assigned_unit_id
  FROM mdata.loads l, transp t
  WHERE l.operating_company_id = t.company_id
    AND l.id <> '79761ac9-d526-426f-9c4b-86f8fe8d69f7'::uuid
    AND l.id NOT IN (SELECT load_id FROM dispatch_board_loads)
    AND (upper(l.load_number) LIKE 'DEMO%' OR upper(l.load_number) LIKE 'TEST%')
)

-- ── Section 0: EXCLUSIONS (the REAL vehicles + loads being protected) ────────────────────────
SELECT '0_EXCLUDED_REAL' AS section, eru.unit_id::text AS id, u.unit_number AS label, u.vin,
       'PROTECTED (active Dispatch board / T139)' AS note
FROM excluded_real_units eru JOIN mdata.units u ON u.id = eru.unit_id

UNION ALL
SELECT '0_EXCLUDED_DISPATCH_LOAD', dbl.load_id::text, dbl.load_number, NULL,
       'PROTECTED Dispatch-board load (not test data)'
FROM dispatch_board_loads dbl

-- ── Section 1: CANDIDATE TRUCKS with linked-record counts ────────────────────────────────────
UNION ALL
SELECT '1_UNIT', cu.id::text,
       cu.unit_number || '  [' || cu.marker_reason || ', status=' || cu.status
         || CASE WHEN cu.deactivated_at IS NOT NULL THEN ', ALREADY-INACTIVE' ELSE '' END || ']',
       cu.vin,
       'loads=' || (SELECT count(*) FROM mdata.loads x WHERE x.assigned_unit_id = cu.id)
       || ' wo=' || (SELECT count(*) FROM maintenance.work_orders x WHERE x.unit_id = cu.id)
       || ' fuel=' || (SELECT count(*) FROM fuel.fuel_transactions x WHERE x.unit_id = cu.id)
       || ' dot_insp=' || (SELECT count(*) FROM safety.dot_inspections x WHERE x.unit_id = cu.id)
       || ' maint_insp=' || (SELECT count(*) FROM maintenance.inspections x WHERE x.unit_id = cu.id)
FROM candidate_units cu

-- ── Section 2: CANDIDATE TRAILERS ────────────────────────────────────────────────────────────
UNION ALL
SELECT '2_TRAILER', ce.id::text,
       ce.equipment_number || '  [' || ce.marker_reason || ', type=' || COALESCE(ce.equipment_type,'?')
         || ', status=' || ce.status || CASE WHEN ce.deactivated_at IS NOT NULL THEN ', ALREADY-INACTIVE' ELSE '' END || ']',
       ce.vin,
       'wo=' || (SELECT count(*) FROM maintenance.work_orders x WHERE x.unit_id = ce.id)
FROM candidate_equipment ce

-- ── Section 3: CANDIDATE LOADS ───────────────────────────────────────────────────────────────
UNION ALL
SELECT '3_LOAD', cl.id::text,
       cl.load_number || '  [status=' || cl.status
         || CASE WHEN cl.soft_deleted_at IS NOT NULL THEN ', ALREADY-SOFT-DELETED' ELSE '' END || ']',
       NULL,
       'assigned_unit_id=' || COALESCE(cl.assigned_unit_id::text,'(none)')
FROM candidate_loads cl

ORDER BY section, label;

ROLLBACK;   -- guarantees zero writes
