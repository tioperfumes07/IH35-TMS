#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routesPath = path.join(repoRoot, "apps/backend/src/accounting/sales-tax/routes.ts");

function fail(messages) {
  console.error("verify:sales-tax-routes-tenant-scope — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routesPath)) {
  fail(["missing apps/backend/src/accounting/sales-tax/routes.ts"]);
}

const source = fs.readFileSync(routesPath, "utf8");
const failures = [];
if (!/withCompanyScope\(/.test(source)) failures.push("routes must use withCompanyScope tenant guard");
if (!/operating_company_id/.test(source)) failures.push("routes must require operating_company_id in request data");
if (!/accounting\.sales_tax_returns/.test(source)) failures.push("routes must operate on accounting.sales_tax_returns");
if (!/accounting\.sales_tax_agencies/.test(source)) failures.push("routes must operate on accounting.sales_tax_agencies");

if (failures.length > 0) fail(failures);
console.log("verify:sales-tax-routes-tenant-scope — OK");
