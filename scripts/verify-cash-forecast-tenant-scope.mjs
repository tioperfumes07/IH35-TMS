#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/cash-forecast.routes.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/CashForecastPage.tsx");
const migrationPath = path.join(process.cwd(), "db/migrations/0235_block_cf_cash_forecast_settings.sql");

const failures = [];

for (const p of [routePath, pagePath, migrationPath]) {
  if (!fs.existsSync(p)) failures.push(`missing required file: ${p}`);
}

if (failures.length === 0) {
  const routeSource = fs.readFileSync(routePath, "utf8");
  const pageSource = fs.readFileSync(pagePath, "utf8");
  const migrationSource = fs.readFileSync(migrationPath, "utf8");

  if (!routeSource.includes("/api/v1/accounting/cash-forecast")) failures.push("cash forecast endpoint must exist");
  if (!routeSource.includes("withCompanyScope")) failures.push("cash forecast route must use withCompanyScope");
  if (!routeSource.includes("operating_company_id")) failures.push("cash forecast route must scope by operating_company_id");
  if (!routeSource.includes("cash_forecast_settings")) failures.push("cash forecast route must read recurring settings");
  if (!pageSource.includes("13-week cash forecast")) failures.push("frontend cash forecast page title missing");
  if (!migrationSource.includes("ENABLE ROW LEVEL SECURITY")) failures.push("cash forecast settings migration must enable RLS");
}

if (failures.length > 0) {
  console.error("verify:cash-forecast-tenant-scope — FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("verify:cash-forecast-tenant-scope — OK");
