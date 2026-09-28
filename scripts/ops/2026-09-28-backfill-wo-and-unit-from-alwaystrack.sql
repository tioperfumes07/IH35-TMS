-- AUTH-095 — ROUND 155.26/157-A item 3: customer_wo_number backfill (all 16 real loads,
-- 13624-13639) and the one conflict-free assigned_unit_id write (13631 -> T174), values taken
-- verbatim from the owner's own AlwaysTrack ground-truth table. Executed live 2026-09-28 via the
-- Neon MCP (SET LOCAL app.bypass_rls='lucia' in the same transaction). Recorded here for the
-- shared file, exactly as run -- not a script meant to be re-run (both UPDATEs are already
-- guarded WHERE ... IS NULL, so re-running is a no-op, not a hazard).
--
-- The other 11 needed unit assignments from the same table are NOT included here -- every one is
-- blocked by uq_loads_one_active_unit (see AUTH-095's own entry in OWNER-AUTHORIZATIONS.md for the
-- full reasoning). Do not add them here without first resolving that conflict for real.

UPDATE mdata.loads SET customer_wo_number = CASE load_number
  WHEN '13624' THEN '2648812'
  WHEN '13625' THEN 'LGMX142'
  WHEN '13626' THEN '005804613'
  WHEN '13627' THEN '21868'
  WHEN '13628' THEN '4690712-1'
  WHEN '13629' THEN 'SHP7437063'
  WHEN '13630' THEN '1013949'
  WHEN '13631' THEN '1332528'
  WHEN '13632' THEN '3-94954-0'
  WHEN '13633' THEN '1776502'
  WHEN '13634' THEN '3-95379-0'
  WHEN '13635' THEN '2035346'
  WHEN '13636' THEN '2648846'
  WHEN '13637' THEN '2648813'
  WHEN '13638' THEN '56713'
  WHEN '13639' THEN '1013880-2'
END
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND load_number IN ('13624','13625','13626','13627','13628','13629','13630','13631',
                       '13632','13633','13634','13635','13636','13637','13638','13639')
  AND customer_wo_number IS NULL;

-- T174, the only one of the 12 missing units with zero uq_loads_one_active_unit conflict.
UPDATE mdata.loads SET assigned_unit_id = '8a842d23-8261-4c5a-bf72-bb38fa93b9f5'::uuid
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND load_number = '13631'
  AND assigned_unit_id IS NULL;
