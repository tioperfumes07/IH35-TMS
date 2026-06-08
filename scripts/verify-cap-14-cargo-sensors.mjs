#!/usr/bin/env node
/**
 * GAP-64 CI guard — CAP-14 Cargo Temp/Humidity Sensor Integration.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`MISSING: ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function must(rel, content, checks) {
  if (!content) return;
  for (const check of checks) {
    if (!content.includes(check)) failures.push(`${rel}: missing ${check}`);
  }
}

const migration = read("db/migrations/202606080219_cargo_sensor_readings.sql");
must("db/migrations/202606080219_cargo_sensor_readings.sql", migration, [
  "dispatch.cargo_sensor_readings",
  "ENABLE ROW LEVEL SECURITY",
  "GRANT USAGE ON SCHEMA dispatch TO ih35_app",
  "GRANT SELECT, INSERT ON dispatch.cargo_sensor_readings TO ih35_app",
]);

must("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts", read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts"), [
  "export async function runCargoSensorIngestionForCompany",
  "export async function upsertCargoSensorReading",
]);

must("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/threshold.service.ts", read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/threshold.service.ts"), [
  "export async function processOutOfRangeAlerts",
]);

must("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts", read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts"), [
  "/api/v1/dispatch/cargo-sensors/load/",
  "/api/v1/dispatch/cargo-sensors/out-of-range",
  "registerCap14CargoSensorRoutes",
]);

must("apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts", read("apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts"), [
  "initializeCap14CargoSensorWorker",
  "5 * 60 * 1000",
]);

must("apps/backend/src/index.ts", read("apps/backend/src/index.ts"), [
  "registerCap14CargoSensorRoutes",
  "initializeCap14CargoSensorWorker",
]);

must("apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx", read("apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx"), [
  "cargo-sensor-timeline",
]);

must("apps/frontend/src/components/dispatch/CargoTempBadge.tsx", read("apps/frontend/src/components/dispatch/CargoTempBadge.tsx"), [
  "cargo-temp-badge-",
]);

must("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx"), [
  "CargoTempBadge",
]);

read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/__tests__/ingester.test.ts");
read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/__tests__/threshold.test.ts");
read("docs/specs/gap-64-cap-14-cargo-sensors.md");

must(".block-ready/GAP-64.json", read(".block-ready/GAP-64.json"), ['"block_id": "GAP-64"', "verify:cap-14-cargo-sensors"]);

if (failures.length) {
  console.error("verify:cap-14-cargo-sensors — FAILED");
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log("verify:cap-14-cargo-sensors — OK");
