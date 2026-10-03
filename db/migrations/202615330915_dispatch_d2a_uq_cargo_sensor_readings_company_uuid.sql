-- IH35_MIGRATION_NO_TRANSACTION
-- 202615330915 · CC-3 · Dispatch D2a (the block, dispatch tables) — dispatch.cargo_sensor_readings gets the (operating_company_id, uuid) unique key the
-- same-company foreign keys in 202615330923 reference. uuid is already unique, so this cannot fail on data. One statement.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cargo_sensor_readings_company_uuid ON dispatch.cargo_sensor_readings (operating_company_id, uuid);
