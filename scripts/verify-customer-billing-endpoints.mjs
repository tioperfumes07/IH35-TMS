#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "apps/backend/src/index.ts");
const billingRoutesPath = path.join(repoRoot, "apps/backend/src/mdata/customer-billing.routes.ts");
const billingTestPath = path.join(repoRoot, "apps/backend/src/mdata/customer-billing.routes.test.ts");
const ciPath = path.join(repoRoot, ".github/workflows/ci.yml");
const customerDetailPath = path.join(repoRoot, "apps/frontend/src/pages/CustomerDetail.tsx");

const indexSource = fs.readFileSync(indexPath, "utf8");
const billingSource = fs.readFileSync(billingRoutesPath, "utf8");
const billingTestSource = fs.readFileSync(billingTestPath, "utf8");
const ciSource = fs.readFileSync(ciPath, "utf8");
const customerDetailSource = fs.readFileSync(customerDetailPath, "utf8");

const failures = [];

if (!indexSource.includes("registerCustomerBillingRoutes")) {
  failures.push("index.ts must register registerCustomerBillingRoutes");
}
if (!billingSource.includes('app.get("/api/v1/mdata/customers/:customer_id/billing-summary"')) {
  failures.push("customer-billing.routes.ts must expose GET billing-summary");
}
if (billingSource.includes("days_due")) {
  failures.push("customer-billing.routes.ts must not reference catalogs.payment_terms.days_due (use days_until_due)");
}
if (!billingSource.includes("days_until_due AS credit_terms_days")) {
  failures.push("billing summary must join catalogs.payment_terms.days_until_due");
}
if (!billingSource.includes("to_regclass") || !billingSource.includes("views.ar_aging")) {
  failures.push("billing summary must guard views.ar_aging with to_regclass before querying");
}
if (!/payments[\s\S]*operating_company_id = \$2/.test(billingSource)) {
  failures.push("billing summary last-payment query must scope operating_company_id");
}
if (!billingTestSource.includes("statusCode).toBe(200") && !billingTestSource.includes("statusCode).toBe(404")) {
  failures.push("customer-billing.routes.test.ts must assert non-500 status codes");
}
if (!billingTestSource.includes("statusCode).toBe(401")) {
  failures.push("customer-billing.routes.test.ts must assert unauthenticated callers get 401");
}
if (!ciSource.includes("verify:customer-billing-endpoints")) {
  failures.push("ci.yml must run verify:customer-billing-endpoints");
}
if (!customerDetailSource.includes("billingSummaryQuery.isError") || !customerDetailSource.includes("ListErrorBanner")) {
  failures.push("CustomerDetail.tsx must surface billing-summary errors via ListErrorBanner");
}

if (failures.length > 0) {
  console.error("verify:customer-billing-endpoints — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("verify:customer-billing-endpoints — OK");
