#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "apps/backend/src/index.ts");
const billingRoutesPath = path.join(repoRoot, "apps/backend/src/mdata/customer-billing.routes.ts");
const aliasRoutesPath = path.join(repoRoot, "apps/backend/src/mdata/customer-detail-alias.routes.ts");

const indexSource = fs.readFileSync(indexPath, "utf8");
const billingSource = fs.readFileSync(billingRoutesPath, "utf8");
const aliasSource = fs.readFileSync(aliasRoutesPath, "utf8");

const failures = [];

if (!indexSource.includes("registerCustomerBillingRoutes")) {
  failures.push("index.ts must register registerCustomerBillingRoutes");
}
if (!billingSource.includes('app.get("/api/v1/mdata/customers/:customer_id/billing-summary"')) {
  failures.push("customer-billing.routes.ts must expose GET /api/v1/mdata/customers/:customer_id/billing-summary");
}
if (!billingSource.includes("days_until_due AS credit_terms_days")) {
  failures.push("billing summary must join catalogs.payment_terms.days_until_due");
}
if (!billingSource.includes("set_config('app.operating_company_id'")) {
  failures.push("billing summary must set app.operating_company_id via set_config");
}
if (!/payments[\s\S]*operating_company_id = \$2/.test(billingSource)) {
  failures.push("billing summary last-payment query must scope operating_company_id");
}
if (!billingSource.includes("mdata.customers.billing_summary_viewed")) {
  failures.push("billing summary route must audit billing_summary_viewed reads");
}
if (!aliasSource.includes('app.get("/api/v1/customers/:customer_id/billing-summary"')) {
  failures.push("customer-detail-alias.routes.ts must alias GET /api/v1/customers/:customer_id/billing-summary");
}

if (failures.length > 0) {
  console.error("verify:billing-summary-route — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("verify:billing-summary-route — OK");
