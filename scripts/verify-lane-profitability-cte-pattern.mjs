#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const laneService = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/lane-profitability.service.ts"), "utf8");
const truckRoutes = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/profit-per-truck.routes.ts"), "utf8");

const requiredJoins = [
  "driver_finance.driver_bills",
  "maintenance.work_orders",
  "fuel.fuel_transactions",
  "load_scope",
];

for (const token of requiredJoins) {
  if (!laneService.includes(token)) {
    console.error(`verify:lane-profitability-cte-pattern FAIL: lane service missing ${token}`);
    process.exit(1);
  }
}

if (!truckRoutes.includes("driver_finance.driver_bills") || !truckRoutes.includes("fuel.fuel_transactions")) {
  console.error("verify:lane-profitability-cte-pattern FAIL: profit-per-truck reference missing expected joins");
  process.exit(1);
}

if (!laneService.includes("WITH pickup AS") || !laneService.includes("load_scope AS (")) {
  console.error("verify:lane-profitability-cte-pattern FAIL: lane service must define pickup/delivery load_scope CTEs");
  process.exit(1);
}

console.log("verify:lane-profitability-cte-pattern PASS");
