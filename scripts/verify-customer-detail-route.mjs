#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "apps/backend/src/index.ts");
const mdataCustomersPath = path.join(repoRoot, "apps/backend/src/mdata/customers.routes.ts");
const customersIndexPath = path.join(repoRoot, "apps/backend/src/customers/index.ts");
const detailRoutesPath = path.join(repoRoot, "apps/backend/src/customers/detail.routes.ts");

const indexSource = fs.readFileSync(indexPath, "utf8");
const mdataCustomersSource = fs.readFileSync(mdataCustomersPath, "utf8");
const customersIndexSource = fs.readFileSync(customersIndexPath, "utf8");
const detailRoutesSource = fs.readFileSync(detailRoutesPath, "utf8");

const failures = [];

if (!indexSource.includes("registerMdataRoutes")) {
  failures.push("index.ts must register mdata routes");
}
if (!indexSource.includes("registerCustomerRoutes(app)") || !indexSource.includes('./customers/index.js"')) {
  failures.push("index.ts must register canonical /api/v1/customers routes");
}
if (!mdataCustomersSource.includes('app.get("/api/v1/mdata/customers/:id/detail"')) {
  failures.push("mdata customers.routes.ts must expose GET /api/v1/mdata/customers/:id/detail");
}
if (!/c\.operating_company_id = \$2/.test(mdataCustomersSource)) {
  failures.push("mdata customer detail query must filter on c.operating_company_id");
}
if (!mdataCustomersSource.includes("mdata.customers.detail_viewed")) {
  failures.push("mdata customer detail route must audit detail_viewed reads");
}
if (!customersIndexSource.includes("registerCustomerDetailRoutes")) {
  failures.push("customers/index.ts must wire registerCustomerDetailRoutes");
}
if (!detailRoutesSource.includes('app.get("/api/v1/customers/:id/detail"')) {
  failures.push("customers/detail.routes.ts must expose GET /api/v1/customers/:id/detail");
}

if (failures.length > 0) {
  console.error("verify:customer-detail-route — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("verify:customer-detail-route — OK");
