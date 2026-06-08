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

const migration = read("db/migrations/202606080221_customer_relationship_scores.sql");
contains("db/migrations/202606080221_customer_relationship_scores.sql", migration, [
  { pattern: /CREATE TABLE IF NOT EXISTS master_data\.customer_relationship_scores/, label: "relationship score table" },
  { pattern: /health_tier IN \('thriving', 'healthy', 'watch', 'at_risk'\)/, label: "health tier check" },
  { pattern: /GRANT USAGE ON SCHEMA master_data TO ih35_app/, label: "schema usage grant to ih35_app" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON master_data\.customer_relationship_scores TO ih35_app/, label: "table grant to ih35_app" },
  { pattern: /customer_relationship_scores_tenant_scope/, label: "tenant RLS policy" },
]);

const scorer = read("apps/backend/src/customers/relationship-score/scorer.service.ts");
contains("apps/backend/src/customers/relationship-score/scorer.service.ts", scorer, [
  { pattern: /export async function computeRelationshipScore/, label: "computeRelationshipScore export" },
  { pattern: /engagement_subscore: 0\.25/, label: "engagement weight 25%" },
  { pattern: /payment_behavior_subscore: 0\.3/, label: "payment weight 30%" },
  { pattern: /service_quality_subscore: 0\.25/, label: "service quality weight 25%" },
  { pattern: /margin_trend_subscore: 0\.1/, label: "margin trend weight 10%" },
  { pattern: /complaint_subscore: 0\.1/, label: "complaint weight 10%" },
  { pattern: /if \(!hasStopArrivals \|\| !hasLoadStops \|\| !hasLoads\) return null/, label: "GAP-30 graceful degrade" },
  { pattern: /if \(!hasLoads\) return null/, label: "GAP-35 graceful degrade" },
]);

const routes = read("apps/backend/src/customers/relationship-score/routes.ts");
contains("apps/backend/src/customers/relationship-score/routes.ts", routes, [
  { pattern: /\/api\/v1\/customers\/:uuid\/relationship-score/, label: "single-customer score route" },
  { pattern: /\/api\/v1\/customers\/relationship-scores\/at-risk/, label: "at-risk list route" },
]);

read("apps/backend/src/customers/relationship-score/__tests__/scorer.test.ts");

const worker = read("apps/backend/src/jobs/customer-relationship-scorer.ts");
contains("apps/backend/src/jobs/customer-relationship-scorer.ts", worker, [
  { pattern: /DEFAULT_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/, label: "6h worker interval" },
  { pattern: /initializeCustomerRelationshipScorerWorker/, label: "worker initializer" },
]);

const backendIndex = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", backendIndex, [
  { pattern: /registerCustomerRelationshipScoreRoutes/, label: "relationship routes wired" },
  { pattern: /initializeCustomerRelationshipScorerWorker/, label: "relationship worker wired" },
]);

const frontendComponent = read("apps/frontend/src/components/customers/CustomerRelationshipScore.tsx");
contains("apps/frontend/src/components/customers/CustomerRelationshipScore.tsx", frontendComponent, [
  { pattern: /Relationship Health/, label: "card title" },
  { pattern: /Engagement/, label: "engagement label" },
  { pattern: /Payment/, label: "payment label" },
  { pattern: /Service/, label: "service label" },
]);

const customerDetail = read("apps/frontend/src/pages/CustomerDetail.tsx");
contains("apps/frontend/src/pages/CustomerDetail.tsx", customerDetail, [
  { pattern: /CustomerRelationshipScore/, label: "customer detail card render" },
  { pattern: /getCustomerRelationshipScore/, label: "customer detail API wiring" },
]);

const customerList = read("apps/frontend/src/pages/customers/CustomersListView.tsx");
contains("apps/frontend/src/pages/customers/CustomersListView.tsx", customerList, [
  { pattern: /label: "Health"/, label: "health column added" },
  { pattern: /relationshipTierBadge/, label: "tier badge formatter" },
]);

const docs = read("docs/specs/gap-72-customer-relationship-score.md");
contains("docs/specs/gap-72-customer-relationship-score.md", docs, [
  { pattern: /GAP-72/, label: "GAP-72 identifier" },
  { pattern: /relationship-score/, label: "relationship score route docs" },
]);

const blockManifest = read(".block-ready/GAP-72.json");
contains(".block-ready/GAP-72.json", blockManifest, [
  { pattern: /"block_id": "GAP-72"/, label: "block id" },
  { pattern: /verify:customer-relationship-score/, label: "verify gate in manifest" },
]);

const branchManifest = read(".block-ready/FEATURE-GAP-72-CUSTOMER-SCORE.json");
contains(".block-ready/FEATURE-GAP-72-CUSTOMER-SCORE.json", branchManifest, [
  { pattern: /"block_id": "GAP-72"/, label: "branch block manifest id" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /"verify:customer-relationship-score": "node scripts\/verify-customer-relationship-score\.mjs"/, label: "npm verify script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:customer-relationship-score/, label: "CI verify step" },
]);

if (failures.length > 0) {
  console.error("verify:customer-relationship-score — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:customer-relationship-score — OK");
