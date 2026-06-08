#!/usr/bin/env node
/**
 * CI Guard: verify-cap-12-tire-tread.mjs — GAP-62
 * Verifies migration, worker, routes, dashboard, and unit tires tab.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function checkExists(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    fail(`MISSING: ${relativePath}`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

function checkContains(relativePath, content, patterns) {
  if (!content) return;
  for (const { pattern, label } of patterns) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    if (!re.test(content)) {
      fail(`${relativePath}: missing ${label}`);
    }
  }
}

const migration = checkExists("db/migrations/202606071810_tire_tread_measurements.sql");
checkContains("db/migrations/202606071810_tire_tread_measurements.sql", migration, [
  { pattern: /maintenance\.tire_tread_measurements/, label: "tire_tread_measurements table" },
  { pattern: /maintenance\.tire_projections/, label: "tire_projections table" },
  { pattern: /idx_tread_unit_position/, label: "tread unit position index" },
  { pattern: /GRANT SELECT, INSERT/, label: "ih35_app GRANT" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
]);

const measurementSvc = checkExists(
  "apps/backend/src/integrations/samsara/cap-12-tire-tread/measurement.service.ts"
);
checkContains(
  "apps/backend/src/integrations/samsara/cap-12-tire-tread/measurement.service.ts",
  measurementSvc,
  [
    { pattern: /recordMeasurement/, label: "recordMeasurement function" },
    { pattern: /getLatestForUnit/, label: "getLatestForUnit function" },
    { pattern: /dotThresholdForPosition/, label: "DOT threshold helper" },
  ]
);

const projectionSvc = checkExists(
  "apps/backend/src/integrations/samsara/cap-12-tire-tread/projection.service.ts"
);
checkContains(
  "apps/backend/src/integrations/samsara/cap-12-tire-tread/projection.service.ts",
  projectionSvc,
  [
    { pattern: /linearRegression/, label: "linearRegression function" },
    { pattern: /projectReplacementDate/, label: "projectReplacementDate function" },
    { pattern: /listAtRiskUnits/, label: "listAtRiskUnits function" },
  ]
);

const routes = checkExists("apps/backend/src/integrations/samsara/cap-12-tire-tread/routes.ts");
checkContains("apps/backend/src/integrations/samsara/cap-12-tire-tread/routes.ts", routes, [
  { pattern: /\/api\/v1\/maintenance\/tire-tread\/measurements/, label: "measurements routes" },
  { pattern: /\/api\/v1\/maintenance\/tire-tread\/projections/, label: "projections route" },
  { pattern: /\/api\/v1\/maintenance\/tire-tread\/at-risk/, label: "at-risk route" },
  { pattern: /registerCap12TireTreadRoutes/, label: "register export" },
]);

checkExists("apps/backend/src/integrations/samsara/cap-12-tire-tread/__tests__/measurement.test.ts");
checkExists("apps/backend/src/integrations/samsara/cap-12-tire-tread/__tests__/projection.test.ts");

const worker = checkExists("apps/backend/src/jobs/cap-12-tire-tread-worker.ts");
checkContains("apps/backend/src/jobs/cap-12-tire-tread-worker.ts", worker, [
  { pattern: /0 5 \* \* \*/, label: "daily cron schedule" },
  { pattern: /initializeCap12TireTreadWorker/, label: "worker init export" },
  { pattern: /runCap12TireTreadWorkerTick/, label: "testable tick export" },
]);

const indexTs = checkExists("apps/backend/src/index.ts");
checkContains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerCap12TireTreadRoutes/, label: "routes registered in index" },
  { pattern: /initializeCap12TireTreadWorker/, label: "worker registered in index" },
]);

const dashboard = checkExists("apps/frontend/src/pages/maintenance/tires/TireWearDashboard.tsx");
checkContains("apps/frontend/src/pages/maintenance/tires/TireWearDashboard.tsx", dashboard, [
  { pattern: /TireWearDashboard/, label: "dashboard export" },
  { pattern: /tire-tread\/at-risk/, label: "at-risk API call" },
  { pattern: /tire-wear-dashboard/, label: "dashboard test id" },
]);

const chart = checkExists("apps/frontend/src/components/maintenance/TireWearProjectionChart.tsx");
checkContains("apps/frontend/src/components/maintenance/TireWearProjectionChart.tsx", chart, [
  { pattern: /TireWearProjectionChart/, label: "chart export" },
  { pattern: /ReferenceLine/, label: "projected replacement threshold line" },
]);

const unitTab = checkExists("apps/frontend/src/pages/maintenance/units/UnitTiresTab.tsx");
checkContains("apps/frontend/src/pages/maintenance/units/UnitTiresTab.tsx", unitTab, [
  { pattern: /UnitTiresTab/, label: "unit tires tab export" },
  { pattern: /TireWearProjectionChart/, label: "wear chart composition" },
  { pattern: /unit-tires-tab/, label: "tab test id" },
]);

const unitDetail = checkExists("apps/frontend/src/pages/units/UnitDetail.tsx");
checkContains("apps/frontend/src/pages/units/UnitDetail.tsx", unitDetail, [
  { pattern: /UnitTiresTab/, label: "tires tab wired in UnitDetail" },
]);

const manifest = checkExists("apps/frontend/src/routes/manifest.tsx");
checkContains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /TireWearDashboard/, label: "dashboard route import" },
  { pattern: /\/maintenance\/tires\/wear/, label: "wear dashboard route" },
]);

const docs = checkExists("docs/specs/gap-62-cap-12-tire-tread.md");
checkContains("docs/specs/gap-62-cap-12-tire-tread.md", docs, [
  { pattern: /GAP-62/, label: "GAP-62 identifier" },
  { pattern: /4\/32/, label: "steer DOT threshold documented" },
  { pattern: /2\/32/, label: "drive DOT threshold documented" },
]);

const blockManifest = checkExists(".block-ready/GAP-62.json");
checkContains(".block-ready/GAP-62.json", blockManifest, [
  { pattern: /GAP-62-CAP-12-TIRE-TREAD/, label: "block id in manifest" },
]);

if (failures.length > 0) {
  console.error("verify:cap-12-tire-tread — FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}

console.log("verify:cap-12-tire-tread — OK");
