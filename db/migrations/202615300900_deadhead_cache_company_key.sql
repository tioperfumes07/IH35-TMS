-- 202615300900 · CC-3 · ROUND 337 — reports.deadhead_cache is a per-company weekly rollup, but its unique key was
-- (unit_id, week_starting): a unit owned by one entity and leased to another is computed by BOTH, and whichever entity's
-- refresh ran last overwrote the other's row (ON CONFLICT (unit_id, week_starting) DO UPDATE SET operating_company_id = ...).
-- The key becomes (operating_company_id, unit_id, week_starting). Additive first, then the old key goes; idempotent.
-- The writer (reports/deadhead.service.ts) targets the new key in the same PR. No row changes: the old key was stricter.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deadhead_company_unit_week
  ON reports.deadhead_cache (operating_company_id, unit_id, week_starting);

DROP INDEX IF EXISTS reports.uq_deadhead_unit_week;
