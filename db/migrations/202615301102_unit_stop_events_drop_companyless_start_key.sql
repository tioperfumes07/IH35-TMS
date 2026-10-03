-- 202615301102 · CC-3 · ROUND 340.2 (3 of 3) — drop the company-less key (unit_id, started_at). It is a UNIQUE CONSTRAINT
-- (pg_constraint contype 'u'), not a bare index: DROP INDEX on a constraint's index is refused ("cannot drop index ...
-- because constraint ... requires it"), so this is ALTER TABLE ... DROP CONSTRAINT. Runs only after 1059 and 1101 built
-- (migration order); the deploy verification checks indisvalid on both before this one is relied on. Idempotent.
ALTER TABLE telematics.unit_stop_events DROP CONSTRAINT IF EXISTS unit_stop_events_unit_start_unique;
