-- 443.100 C2 lane 3 (CC-3) — accounting.factoring_advances.status_before_void exists on prod (text, NULL) but no
-- migration creates it, so a fresh database lacks it and the factoring_advance void executor
-- (apps/backend/src/governance/void-cancel-executors.ts, #23175) writes a phantom column there
-- (verify-sql-write-targets). Restates the prod column exactly; a no-op on prod.
SET LOCAL lock_timeout = '60s';

ALTER TABLE accounting.factoring_advances ADD COLUMN IF NOT EXISTS status_before_void text;
