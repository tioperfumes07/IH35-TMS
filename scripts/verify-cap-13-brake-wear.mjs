#!/usr/bin/env node
/**
 * GAP-63 CI guard — CAP-13 Brake Wear Predictive Maintenance.
 *
 * Asserts the additive surface is present and wired:
 *   - migration creates measurements + projections tables with RLS
 *   - service + routes + worker exist
 *   - dashboard + gauge + unit tab render
 *   - index.ts registers routes and worker
 *   - spec doc cites DOT §393.47 thresholds
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function cap13WiringFailures({ index, maintenanceHome, manifest }) {
  const missing = [];
  if (!/import \{ initializeCap13BrakeWearWorker \} from ["']\.\/jobs\/cap-13-brake-wear-worker\.js["']/.test(index)) {
    missing.push("worker import");
  }
  if (!/initializeCap13BrakeWearWorker\(app\)/.test(index)) missing.push("worker initialization");
  if (!/import \{ BrakeWearDashboard \} from ["']\.\/brakes\/BrakeWearDashboard["']/.test(maintenanceHome)) {
    missing.push("integrated dashboard import");
  }
  if (!/tab === ["']brake_wear["'][\s\S]{0,220}<BrakeWearDashboard\s*\/>/.test(maintenanceHome)) {
    missing.push("integrated dashboard mount");
  }
  if (!/path=["']\/maintenance\/brake-wear["'][\s\S]{0,220}<MaintenanceTabRoute tabId=["']brake_wear["']/.test(manifest)) {
    missing.push("canonical brake-wear route");
  }
  return missing;
}

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

const migration = read("db/migrations/202606071820_brake_wear_measurements.sql");
contains("db/migrations/202606071820_brake_wear_measurements.sql", migration, [
  { pattern: /maintenance\.brake_wear_measurements/, label: "measurements table" },
  { pattern: /maintenance\.brake_projections/, label: "projections table" },
  { pattern: /lining_thickness_mm/, label: "lining thickness column" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /GRANT SELECT, INSERT ON maintenance\.brake_wear_measurements TO ih35_app/, label: "measurements grant" },
]);

const service = read("apps/backend/src/integrations/samsara/cap-13-brake-wear/service.ts");
contains("apps/backend/src/integrations/samsara/cap-13-brake-wear/service.ts", service, [
  { pattern: /export async function recordMeasurement/, label: "recordMeasurement" },
  { pattern: /export async function getLatestForUnit/, label: "getLatestForUnit" },
  { pattern: /export async function projectReplacement/, label: "projectReplacement" },
  { pattern: /export async function getAtRiskFleet/, label: "getAtRiskFleet" },
  { pattern: /393\.47|6\.4|3\.2/, label: "DOT threshold constants" },
]);

read("apps/backend/src/integrations/samsara/cap-13-brake-wear/__tests__/service.test.ts");

const routes = read("apps/backend/src/integrations/samsara/cap-13-brake-wear/routes.ts");
contains("apps/backend/src/integrations/samsara/cap-13-brake-wear/routes.ts", routes, [
  { pattern: /\/api\/v1\/maintenance\/brake-wear\/measurements/, label: "measurements routes" },
  { pattern: /\/api\/v1\/maintenance\/brake-wear\/at-risk/, label: "at-risk route" },
  { pattern: /registerCap13BrakeWearRoutes/, label: "register export" },
]);

const worker = read("apps/backend/src/jobs/cap-13-brake-wear-worker.ts");
contains("apps/backend/src/jobs/cap-13-brake-wear-worker.ts", worker, [
  { pattern: /initializeCap13BrakeWearWorker/, label: "worker init export" },
  { pattern: /0 5 \* \* \*/, label: "daily cron schedule" },
  { pattern: /runCap13BrakeWearWorkerTick/, label: "worker tick" },
  { pattern: /upsertProjection/, label: "projection upsert" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerCap13BrakeWearRoutes/, label: "routes wired in index" },
]);

const dashboard = read("apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx");
contains("apps/frontend/src/pages/maintenance/brakes/BrakeWearDashboard.tsx", dashboard, [
  { pattern: /BrakeWearDashboard/, label: "dashboard export" },
  { pattern: /atRiskQ\.isError[\s\S]*?<ListErrorState[\s\S]*?atRiskQ\.refetch\(\)/, label: "retryable list failure before empty projections" },
  { pattern: /brake-wear-dashboard/, label: "dashboard test id" },
  { pattern: /\/api\/v1\/maintenance\/brake-wear\/at-risk/, label: "at-risk API call" },
]);

const gauge = read("apps/frontend/src/components/maintenance/BrakeWearGauge.tsx");
contains("apps/frontend/src/components/maintenance/BrakeWearGauge.tsx", gauge, [
  { pattern: /export function BrakeWearGauge/, label: "gauge export" },
  { pattern: /brake-wear-gauge-/, label: "gauge test id" },
  { pattern: /green|amber|red/, label: "status colors" },
]);

const unitTab = read("apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx");
contains("apps/frontend/src/pages/maintenance/units/UnitBrakesTab.tsx", unitTab, [
  { pattern: /UnitBrakesTab/, label: "unit brakes tab export" },
  { pattern: /unit-brakes-tab/, label: "unit tab test id" },
  { pattern: /BrakeWearGauge/, label: "gauge usage" },
]);

const unitDetail = read("apps/frontend/src/pages/units/UnitDetail.tsx");
contains("apps/frontend/src/pages/units/UnitDetail.tsx", unitDetail, [
  { pattern: /UnitBrakesTab/, label: "brakes tab mounted" },
  { pattern: /"brakes"/, label: "brakes tab key" },
]);

const maintenanceHome = read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");
const manifest = read("apps/frontend/src/routes/manifest.tsx");
for (const missing of cap13WiringFailures({ index: indexTs, maintenanceHome, manifest })) {
  failures.push(`CAP-13 wiring: missing ${missing}`);
}

const docs = read("docs/specs/gap-63-cap-13-brake-wear.md");
contains("docs/specs/gap-63-cap-13-brake-wear.md", docs, [
  { pattern: /GAP-63/, label: "GAP-63 identifier" },
  { pattern: /393\.47/, label: "49 CFR §393.47 citation" },
  { pattern: /6\.4 mm/, label: "steer threshold" },
  { pattern: /3\.2 mm/, label: "drive threshold" },
]);

const blockReady = read(".block-ready/GAP-63.json");
contains(".block-ready/GAP-63.json", blockReady, [
  { pattern: /"block_id": "GAP-63"/, label: "block id" },
  { pattern: /verify:cap-13-brake-wear/, label: "extra gate" },
]);

if (failures.length > 0) {
  console.error("verify:cap-13-brake-wear — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const fixtures = { index: indexTs, maintenanceHome, manifest };
  const mutations = [
    { ...fixtures, index: indexTs.replace("initializeCap13BrakeWearWorker(app)", "void app") },
    { ...fixtures, index: indexTs.replace('import { initializeCap13BrakeWearWorker } from "./jobs/cap-13-brake-wear-worker.js";', "") },
    { ...fixtures, maintenanceHome: maintenanceHome.replace("<BrakeWearDashboard />", "<div />") },
    { ...fixtures, maintenanceHome: maintenanceHome.replace('import { BrakeWearDashboard } from "./brakes/BrakeWearDashboard";', "") },
    { ...fixtures, manifest: manifest.replace('path="/maintenance/brake-wear"', 'path="/maintenance/brake-wear-removed"') },
  ];
  const escaped = mutations.filter((fixture) => cap13WiringFailures(fixture).length === 0);
  if (escaped.length > 0) {
    console.error(`verify:cap-13-brake-wear --selftest FAILED — ${escaped.length}/5 mutations escaped`);
    process.exit(1);
  }
  console.log("verify:cap-13-brake-wear --selftest PASS — 5/5 mutations detected");
  process.exit(0);
}

console.log("verify:cap-13-brake-wear — OK");
