#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/comparison-report.routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/comparison-report.service.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx");

function fail(messages) {
  console.error("verify:comparison-respects-basis — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
for (const file of [routePath, servicePath, pagePath]) {
  if (!fs.existsSync(file)) failures.push(`missing required file: ${file}`);
}
if (failures.length > 0) fail(failures);

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

if (!routeSource.includes("/api/v1/accounting/comparison-report")) failures.push("comparison endpoint route must be registered");
if (!/basis:\s*z\.enum\(\["accrual", "cash"\]\)\.optional\(\)/.test(routeSource)) {
  failures.push("comparison route must validate basis as accrual|cash");
}
if (!serviceSource.includes("transformProfitLossToCashBasis")) failures.push("comparison service must support cash-basis P&L transform");
if (!serviceSource.includes("transformBalanceSheetToCashBasis")) failures.push("comparison service must support cash-basis balance-sheet transform");
if (!serviceSource.includes("type: ComparisonReportType")) failures.push("comparison service must support both pl and bs report types");
if (!pageSource.includes("Basis")) failures.push("frontend comparison page must expose basis selector");

if (failures.length > 0) fail(failures);
console.log("verify:comparison-respects-basis — OK");
