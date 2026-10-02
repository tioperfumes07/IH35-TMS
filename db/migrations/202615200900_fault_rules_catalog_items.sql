-- 202615200900_fault_rules_catalog_items.sql -- E-10 addition (claim #23930).
-- A fault code proposes its repair item: the owner's fault rules (maintenance.fault_code_severity_rules) gain the
-- catalog service task and labor code to propose. Rules stay owner-entered (none seeded); a rule may name an exact
-- code ('SPN 3251 FMI 2') or a whole SPN ('SPN 3251', any FMI). Additive; nullable FKs; no rows changed.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE maintenance.fault_code_severity_rules
  ADD COLUMN IF NOT EXISTS service_task_id uuid NULL REFERENCES catalogs.maintenance_service_tasks(id),
  ADD COLUMN IF NOT EXISTS labor_code_id uuid NULL REFERENCES catalogs.maintenance_labor_codes(id);

COMMENT ON COLUMN maintenance.fault_code_severity_rules.service_task_id IS
  'E-10: the catalog service task this fault code proposes (alert + auto work order).';
COMMENT ON COLUMN maintenance.fault_code_severity_rules.labor_code_id IS
  'E-10: the catalog labor code this fault code proposes (alert + auto work order).';

COMMIT;
