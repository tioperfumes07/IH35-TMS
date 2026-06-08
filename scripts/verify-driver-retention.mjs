#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${rel}`); return ""; }
  return fs.readFileSync(abs, "utf8");
}

function must(rel, content, checks) {
  if (!content) return;
  for (const c of checks) if (!content.includes(c)) failures.push(`${rel}: missing ${c}`);
}

must("db/migrations/202606080220_driver_retention_scores.sql", read("db/migrations/202606080220_driver_retention_scores.sql"), [
  "drivers.retention_scores", "ENABLE ROW LEVEL SECURITY", "GRANT USAGE ON SCHEMA drivers", "ih35_app",
]);
must("apps/backend/src/drivers/retention/scorer.service.ts", read("apps/backend/src/drivers/retention/scorer.service.ts"), [
  "export async function computeRetentionScore", "export function tierFromRiskScore",
]);
must("apps/backend/src/drivers/retention/feature-extractor.ts", read("apps/backend/src/drivers/retention/feature-extractor.ts"), [
  "export async function extractRetentionFeatures",
]);
must("apps/backend/src/drivers/retention/routes.ts", read("apps/backend/src/drivers/retention/routes.ts"), [
  "/api/v1/drivers/retention-scores", "registerDriverRetentionRoutes",
]);
must("apps/backend/src/jobs/driver-retention-scorer-worker.ts", read("apps/backend/src/jobs/driver-retention-scorer-worker.ts"), [
  "initializeDriverRetentionScorerWorker", "0 4 * * 1",
]);
must("apps/backend/src/index.ts", read("apps/backend/src/index.ts"), [
  "registerDriverRetentionRoutes", "initializeDriverRetentionScorerWorker",
]);
must("apps/frontend/src/pages/drivers/RetentionDashboard.tsx", read("apps/frontend/src/pages/drivers/RetentionDashboard.tsx"), [
  "driver-retention-dashboard",
]);
must("apps/frontend/src/components/drivers/AtRiskDriverCard.tsx", read("apps/frontend/src/components/drivers/AtRiskDriverCard.tsx"), [
  "at-risk-driver-card-",
]);
must("apps/frontend/src/pages/DriverDetail.tsx", read("apps/frontend/src/pages/DriverDetail.tsx"), [
  "retention-risk-badge",
]);
must("apps/frontend/src/routes/manifest.tsx", read("apps/frontend/src/routes/manifest.tsx"), [
  "RetentionDashboard", "/drivers/retention",
]);
read("apps/backend/src/drivers/retention/__tests__/scorer.test.ts");
read("docs/specs/gap-71-driver-retention-model.md");
must(".block-ready/GAP-71.json", read(".block-ready/GAP-71.json"), ['"block_id": "GAP-71"', "verify:driver-retention"]);

if (failures.length) {
  console.error("verify:driver-retention — FAILED");
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log("verify:driver-retention — OK");
