#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/202606080218_driver_safety_scores.sql");
contains("db/migrations/202606080218_driver_safety_scores.sql", migration, [
  { pattern: /CREATE TABLE IF NOT EXISTS safety\.driver_safety_scores/, label: "driver_safety_scores table" },
  { pattern: /composite_score NUMERIC\(5, 2\)/, label: "composite_score column" },
  { pattern: /UNIQUE \(driver_uuid, period_start, period_end\)/, label: "unique period constraint" },
  { pattern: /GRANT SELECT, INSERT ON safety\.driver_safety_scores TO ih35_app/, label: "ih35_app grants" },
  { pattern: /driver_safety_scores_tenant_scope/, label: "RLS tenant policy" },
]);

const composite = read("apps/backend/src/safety/driver-scoring/composite-score.ts");
contains("apps/backend/src/safety/driver-scoring/composite-score.ts", composite, [
  { pattern: /MIN_MILES_TO_SCORE = 500/, label: "500 mile minimum" },
  { pattern: /brake: 0\.3/, label: "brake weight 30%" },
  { pattern: /accel: 0\.25/, label: "accel weight 25%" },
  { pattern: /speeding: 0\.25/, label: "speeding weight 25%" },
  { pattern: /lane: 0\.2/, label: "lane weight 20%" },
]);

const service = read("apps/backend/src/safety/driver-scoring/scoring.service.ts");
contains("apps/backend/src/safety/driver-scoring/scoring.service.ts", service, [
  { pattern: /aggregateForPeriod/, label: "aggregateForPeriod export" },
  { pattern: /safety\.harsh_events/, label: "harsh_events source" },
  { pattern: /telematics\.vehicle_driver_assignments/, label: "vehicle_driver_assignments join" },
  { pattern: /safety\.driver_safety_scores/, label: "scores table write" },
  { pattern: /listPeriodLeaderboard/, label: "leaderboard query" },
  { pattern: /listDriverTrend/, label: "trend query" },
]);

const routes = read("apps/backend/src/safety/driver-scoring/scoring.routes.ts");
contains("apps/backend/src/safety/driver-scoring/scoring.routes.ts", routes, [
  { pattern: /\/api\/safety\/driver-scoring\/period/, label: "period leaderboard route" },
  { pattern: /\/api\/safety\/driver-scoring\/driver\/:uuid/, label: "driver trend route" },
  { pattern: /registerDriverCompositeScoringRoutes/, label: "routes register export" },
]);

read("apps/backend/src/safety/driver-scoring/__tests__/scoring.test.ts");

const worker = read("apps/backend/src/jobs/driver-scoring-aggregator-worker.ts");
contains("apps/backend/src/jobs/driver-scoring-aggregator-worker.ts", worker, [
  { pattern: /0 3 \* \* 1/, label: "weekly Monday 3am cron" },
  { pattern: /America\/Chicago/, label: "Central timezone" },
  { pattern: /initializeDriverScoringAggregatorWorker/, label: "worker initializer" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerDriverCompositeScoringRoutes/, label: "composite routes registered" },
  { pattern: /initializeDriverScoringAggregatorWorker/, label: "aggregator worker registered" },
]);

const tab = read("apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx");
contains("apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx", tab, [
  { pattern: /Driver Safety Scoring/, label: "leaderboard title" },
  { pattern: /listDriverSafetyPeriodScores/, label: "period API call" },
  { pattern: /DriverScoreDetail/, label: "detail panel" },
]);

read("apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx");

const safetyTabs = read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts");
contains("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts", safetyTabs, [
  { pattern: /driver-scoring/, label: "driver-scoring tab config" },
  { pattern: /\/safety\/driver-scoring/, label: "driver-scoring route" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /DriverScoringTab/, label: "DriverScoringTab route component" },
  { pattern: /path="driver-scoring"/, label: "driver-scoring route path" },
]);

const docs = read("docs/specs/gap-60-cap-10-driver-scoring.md");
contains("docs/specs/gap-60-cap-10-driver-scoring.md", docs, [
  { pattern: /GAP-60/, label: "GAP-60 identifier" },
  { pattern: /\/api\/safety\/driver-scoring\/period/, label: "period route documented" },
  { pattern: /\/api\/safety\/driver-scoring\/driver/, label: "driver route documented" },
]);

const blockManifest = read(".block-ready/GAP-60.json");
contains(".block-ready/GAP-60.json", blockManifest, [
  { pattern: /GAP-60/, label: "GAP-60 block id in manifest" },
  { pattern: /verify:cap-10-driver-scoring/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-10-driver-scoring/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:cap-10-driver-scoring/, label: "verify step in CI" },
]);

if (failures.length > 0) {
  console.error("verify:cap-10-driver-scoring — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:cap-10-driver-scoring — OK");
