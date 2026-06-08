#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const paths = {
  migration: path.join(root, "db/migrations/202606080203_customer_free_time_detention.sql"),
  service: path.join(root, "apps/backend/src/master-data/customers/free-time-detention.service.ts"),
  routes: path.join(root, "apps/backend/src/master-data/customers/free-time-detention.routes.ts"),
  test: path.join(root, "apps/backend/src/master-data/customers/__tests__/free-time.test.ts"),
  component: path.join(root, "apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx"),
  customerDetail: path.join(root, "apps/frontend/src/pages/CustomerDetail.tsx"),
  indexTs: path.join(root, "apps/backend/src/index.ts"),
  packageJson: path.join(root, "package.json"),
  ci: path.join(root, ".github/workflows/ci.yml"),
  manifest: path.join(root, ".block-ready/GAP-32.json"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migrationSource = read(paths.migration);
const serviceSource = read(paths.service);
const routesSource = read(paths.routes);
const testSource = read(paths.test);
const componentSource = read(paths.component);
const detailSource = read(paths.customerDetail);
const indexSource = read(paths.indexTs);
const packageSource = read(paths.packageJson);
const ciSource = read(paths.ci);
const manifestSource = read(paths.manifest);

const failures = [];

if (!manifestSource.includes('"block_id": "GAP-32"')) failures.push("missing GAP-32 manifest");
if (!migrationSource.includes("ADD COLUMN IF NOT EXISTS free_time_minutes")) failures.push("migration must add free_time_minutes");
if (!migrationSource.includes("ADD COLUMN IF NOT EXISTS detention_currency")) failures.push("migration must add detention_currency");
if (!migrationSource.includes("ADD COLUMN IF NOT EXISTS detention_requires_approval")) failures.push("migration must add detention_requires_approval");
if (!migrationSource.includes("ADD COLUMN IF NOT EXISTS terms_updated_at")) failures.push("migration must add terms_updated_at");
if (!migrationSource.includes("ADD COLUMN IF NOT EXISTS terms_updated_by_user_uuid")) failures.push("migration must add terms_updated_by_user_uuid");
if (!migrationSource.includes("CREATE TABLE IF NOT EXISTS master_data.customer_terms_history")) {
  failures.push("migration must create master_data.customer_terms_history");
}
if (!migrationSource.includes("GRANT USAGE ON SCHEMA master_data TO ih35_app")) {
  failures.push("migration must grant schema usage to ih35_app");
}
if (!migrationSource.includes("CREATE POLICY customer_terms_history_tenant_scope")) {
  failures.push("migration must include tenant scope RLS policy");
}

if (!serviceSource.includes("export async function getTerms")) failures.push("service must export getTerms");
if (!serviceSource.includes("export async function updateTerms")) failures.push("service must export updateTerms");
if (!serviceSource.includes("INSERT INTO master_data.customer_terms_history")) {
  failures.push("updateTerms must write history before update");
}
if (!serviceSource.includes("export async function listTermsHistory")) failures.push("service must export listTermsHistory");

if (!routesSource.includes('app.get("/api/v1/customers/:uuid/free-time-detention"')) {
  failures.push("routes must expose GET /api/v1/customers/:uuid/free-time-detention");
}
if (!routesSource.includes('app.patch("/api/v1/customers/:uuid/free-time-detention"')) {
  failures.push("routes must expose PATCH /api/v1/customers/:uuid/free-time-detention");
}
if (!routesSource.includes('app.get("/api/v1/customers/:uuid/terms-history"')) {
  failures.push("routes must expose GET /api/v1/customers/:uuid/terms-history");
}
if (!routesSource.includes("isManagerPlus")) failures.push("routes must enforce Manager+ role for PATCH");

if (!indexSource.includes("registerCustomerFreeTimeDetentionRoutes")) {
  failures.push("index.ts must register customer free-time detention routes");
}

if (!componentSource.includes("/api/v1/customers/") || !componentSource.includes("free-time-detention")) {
  failures.push("FreeTimeDetentionEditor must call free-time-detention API");
}
if (!componentSource.includes("terms-history")) failures.push("FreeTimeDetentionEditor must call terms-history API");
if (!detailSource.includes("FreeTimeDetentionEditor")) failures.push("CustomerDetail.tsx must render FreeTimeDetentionEditor");
if (!detailSource.includes('activeTab === "Billing & Receivables"')) failures.push("CustomerDetail.tsx billing tab guard missing");
if (!testSource.includes("historyInsertIdx") || !testSource.includes("toBeLessThan")) {
  failures.push("backend tests must verify history write happens before update");
}

if (!packageSource.includes('"verify:customer-free-time-catalog"')) {
  failures.push("package.json must include verify:customer-free-time-catalog script");
}
if (!ciSource.includes("verify:customer-free-time-catalog")) {
  failures.push("ci.yml must execute verify:customer-free-time-catalog");
}

if (failures.length > 0) {
  console.error("verify:customer-free-time-catalog — FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:customer-free-time-catalog — OK");
