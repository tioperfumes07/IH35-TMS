#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];
const retentionRoutesPath = "apps/backend/src/drivers/retention/routes.ts";

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
const retentionRoutes = read(retentionRoutesPath);
const retentionScorer = read("apps/backend/src/drivers/retention/scorer.service.ts");
const retentionFeatures = read("apps/backend/src/drivers/retention/feature-extractor.ts");
const retentionWorker = read("apps/backend/src/jobs/driver-retention-scorer-worker.ts");
must(retentionRoutesPath, retentionRoutes, [
  "/api/v1/drivers/retention-scores", "registerDriverRetentionRoutes",
]);

function exactScoreFailures(source) {
  const start = source.indexOf('app.get("/api/v1/drivers/:uuid/retention-score"');
  if (start < 0) return ["missing exact retention-score route"];
  const route = source.slice(start, start + 2200);
  const existenceIndex = route.indexOf("FROM mdata.drivers");
  const computeIndex = route.indexOf("computeRetentionScore(");
  return [
    !/WHERE id = \$1::uuid[\s\S]*retention_route_dca\.company_id = \$2::uuid[\s\S]*retention_route_dca\.is_authorized = true[\s\S]*retention_route_dca\.deactivated_at IS NULL[\s\S]*AND archived_at IS NULL/.test(route)
      ? "exact retention score must verify home or actively-authorized driver in selected company"
      : null,
    !/if \(driver\.rowCount === 0\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(route)
      ? "exact retention score must return honest 404 for absent/cross-company driver"
      : null,
    existenceIndex < 0 || computeIndex < 0 || existenceIndex > computeIndex
      ? "driver/company verification must precede retention computation"
      : null,
  ].filter(Boolean);
}

function sharedRetentionFailures(routes, scorer, features, worker) {
  const checks = [
    [routes, "retention_route_dca.company_id = $2::uuid"],
    [scorer, "retention_list_dca.company_id = r.operating_company_id"],
    [scorer, "retention_list_dca.is_authorized = true"],
    [features, "(assigned_primary_driver_id = $2::uuid OR assigned_secondary_driver_id = $2::uuid)"],
    [worker, "retention_worker_dca.company_id = $1::uuid"],
    [worker, "retention_worker_dca.is_authorized = true"],
    [worker, "AND d.archived_at IS NULL"],
  ];
  return checks.filter(([source, needle]) => !source.includes(needle)).map(([, needle]) => `shared retention missing ${needle}`);
}

failures.push(...exactScoreFailures(retentionRoutes).map((failure) => `${retentionRoutesPath}: ${failure}`));
failures.push(...sharedRetentionFailures(retentionRoutes, retentionScorer, retentionFeatures, retentionWorker));
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

if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`repo source rejected: ${failures.join("; ")}`);
  const mutations = [
    retentionRoutes.replace("retention_route_dca.is_authorized = true", "retention_route_dca.is_authorized = false"),
    retentionRoutes.replace('return reply.code(404).send({ error: "mdata_driver_not_found" })', 'return reply.send({})'),
    retentionRoutes.replace(
      "const score = await computeRetentionScore(client, query.data.operating_company_id, params.data.uuid);",
      "const score = await computeRetentionScore(client, query.data.operating_company_id, params.data.uuid);\n      // verification moved too late"
    ).replace("const driver = await client.query(", "const driver = await client.query("),
  ];
  // The third mutation is constructed explicitly so computation precedes the company existence read.
  const driverBlockStart = retentionRoutes.indexOf("      const driver = await client.query(");
  const computeLine = "      const score = await computeRetentionScore(client, query.data.operating_company_id, params.data.uuid);";
  const computeAt = retentionRoutes.indexOf(computeLine, driverBlockStart);
  const reordered = retentionRoutes.slice(0, driverBlockStart) + computeLine + "\n" + retentionRoutes.slice(driverBlockStart, computeAt) + retentionRoutes.slice(computeAt + computeLine.length);
  mutations[2] = reordered;
  mutations.forEach((mutant, index) => {
    if (mutant === retentionRoutes || exactScoreFailures(mutant).length === 0) {
      throw new Error(`planted exact-score defect ${index + 1} escaped`);
    }
  });
  const classMutations = [
    [retentionRoutes.replace("retention_route_dca.company_id = $2::uuid", "retention_route_dca.company_id IS NULL"), retentionScorer, retentionFeatures, retentionWorker],
    [retentionRoutes, retentionScorer.replace("retention_list_dca.is_authorized = true", "retention_list_dca.is_authorized = false"), retentionFeatures, retentionWorker],
    [retentionRoutes, retentionScorer, retentionFeatures.replace(" OR assigned_secondary_driver_id = $2::uuid", ""), retentionWorker],
    [retentionRoutes, retentionScorer, retentionFeatures, retentionWorker.replace("retention_worker_dca.is_authorized = true", "retention_worker_dca.is_authorized = false")],
  ];
  classMutations.forEach(([routes, scorer, features, worker], index) => {
    if (sharedRetentionFailures(routes, scorer, features, worker).length === 0) {
      throw new Error(`planted shared-retention defect ${index + 1} escaped`);
    }
  });
  console.log(`verify:driver-retention --selftest — OK (${mutations.length + classMutations.length}/${mutations.length + classMutations.length})`);
  process.exit(0);
}

if (failures.length) {
  console.error("verify:driver-retention — FAILED");
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log("verify:driver-retention — OK");
