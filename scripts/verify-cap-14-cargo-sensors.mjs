#!/usr/bin/env node
/**
 * GAP-64 CI guard — CAP-14 Cargo Temp/Humidity Sensors.
 *
 * Asserts additive CAP-14 surface:
 *  - migration + RLS + ih35_app grants
 *  - ingester + threshold service + routes + worker
 *  - timeline page + dispatch badge + dispatch board wiring
 *  - index.ts wiring + package/ci script hooks
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      failures.push(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/202606080219_cargo_sensor_readings.sql");
contains("db/migrations/202606080219_cargo_sensor_readings.sql", migration, [
  { pattern: /dispatch\.cargo_sensor_readings/, label: "cargo sensor table" },
  { pattern: /operating_company_id uuid/, label: "uuid tenant column" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /current_setting\('app\.operating_company_id', true\)/, label: "tenant scope policy" },
  { pattern: /GRANT USAGE ON SCHEMA dispatch TO ih35_app/, label: "schema grant to ih35_app" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON dispatch\.cargo_sensor_readings TO ih35_app/, label: "table grants to ih35_app" },
  { pattern: /gen_random_uuid\(\)/, label: "uuid default generator" },
]);

const ingester = read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts");
contains("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/ingester.service.ts", ingester, [
  { pattern: /runCargoSensorIngestionTick/, label: "ingestion tick export" },
  { pattern: /upsertCargoSensorReading/, label: "upsert function" },
  { pattern: /listCargoSensorTimelineForLoad/, label: "timeline function" },
  { pattern: /listOutOfRangeCargoReadings/, label: "out-of-range query" },
]);

const threshold = read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/threshold.service.ts");
contains("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/threshold.service.ts", threshold, [
  { pattern: /resolveCargoThresholds/, label: "threshold resolver" },
  { pattern: /evaluateCargoThreshold/, label: "threshold evaluator" },
  { pattern: /detectCargoIncidents/, label: "incident detection" },
  { pattern: /CRITICAL_DURATION_MINUTES = 10/, label: "10-minute critical threshold" },
]);

const routes = read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts");
contains("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts", routes, [
  { pattern: /\/api\/v1\/dispatch\/cargo-sensors\/load\/:load_uuid\/timeline/, label: "timeline route" },
  { pattern: /\/api\/v1\/dispatch\/cargo-sensors\/out-of-range/, label: "out-of-range route" },
  { pattern: /registerCap14CargoSensorRoutes/, label: "route register export" },
]);

read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/__tests__/ingester.test.ts");
read("apps/backend/src/integrations/samsara/cap-14-cargo-sensors/__tests__/threshold.test.ts");

const worker = read("apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts");
contains("apps/backend/src/jobs/cap-14-cargo-sensor-worker.ts", worker, [
  { pattern: /\*\/5 \* \* \* \*/, label: "5-minute cron schedule" },
  { pattern: /initializeCap14CargoSensorWorker/, label: "worker init export" },
  { pattern: /runCap14CargoSensorWorkerTick/, label: "worker tick export" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerCap14CargoSensorRoutes/, label: "routes wired in index" },
  { pattern: /initializeCap14CargoSensorWorker/, label: "worker wired in index" },
]);

const timelinePage = read("apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx");
contains("apps/frontend/src/pages/dispatch/cargo-sensors/CargoSensorTimeline.tsx", timelinePage, [
  { pattern: /CargoSensorTimeline/, label: "timeline component export" },
  { pattern: /cargo-sensor-timeline/, label: "timeline test id" },
  { pattern: /cargo-sensors\/load\/.*\/timeline/, label: "timeline API call" },
]);

const badge = read("apps/frontend/src/components/dispatch/CargoTempBadge.tsx");
contains("apps/frontend/src/components/dispatch/CargoTempBadge.tsx", badge, [
  { pattern: /CargoTempBadge/, label: "badge export" },
  { pattern: /cargo-temp-badge-/, label: "badge test id" },
  { pattern: /isReeferCommodity/, label: "reefer helper" },
]);

const dispatchBoard = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
contains("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", dispatchBoard, [
  { pattern: /CargoTempBadge/, label: "badge wired in dispatch board" },
  { pattern: /Cargo Temp/, label: "cargo temp column label" },
]);

const docs = read("docs/specs/gap-64-cap-14-cargo-sensors.md");
contains("docs/specs/gap-64-cap-14-cargo-sensors.md", docs, [
  { pattern: /GAP-64/, label: "GAP-64 identifier" },
  { pattern: /CAP-14/, label: "CAP-14 identifier" },
  { pattern: /\/api\/v1\/dispatch\/cargo-sensors\/load\/:load_uuid\/timeline/, label: "timeline route documented" },
  { pattern: /\/api\/v1\/dispatch\/cargo-sensors\/out-of-range/, label: "out-of-range route documented" },
]);

const blockManifest = read(".block-ready/GAP-64.json");
contains(".block-ready/GAP-64.json", blockManifest, [
  { pattern: /"block_id": "GAP-64"/, label: "block id" },
  { pattern: /verify:cap-14-cargo-sensors/, label: "extra gate entry" },
  { pattern: /scripts\/verify-cap-14-cargo-sensors\.mjs/, label: "guard file allowlist" },
]);

const rootManifest = read(".block-ready.json");
contains(".block-ready.json", rootManifest, [
  { pattern: /"block_id": "GAP-64"/, label: "root block id pointer" },
  { pattern: /"manifest": "\.block-ready\/GAP-64\.json"/, label: "per-block manifest pointer" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-14-cargo-sensors/, label: "npm verify script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:cap-14-cargo-sensors/, label: "CI verify step" },
]);

if (failures.length > 0) {
  console.error("verify:cap-14-cargo-sensors — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:cap-14-cargo-sensors — OK");
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
