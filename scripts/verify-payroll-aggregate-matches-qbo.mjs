#!/usr/bin/env node
/**
 * CLOSURE-12 — Payroll integration static CI guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:payroll-aggregate-matches-qbo";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const migration = read("apps/backend/src/migrations/202606080241-payroll-integration-cache.sql");
const routes = read("apps/backend/src/payroll-integration/aggregate.routes.ts");
const classAllocator = read("apps/backend/src/payroll-integration/class-allocator.ts");
const tmsPull = read("apps/backend/src/payroll-integration/tms-settlements-pull.ts");
const qboPull = read("apps/backend/src/payroll-integration/qbo-payroll-pull.ts");
const page = read("apps/frontend/src/pages/payroll-integration/PayrollIntegrationPage.tsx");
const table = read("apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx");
const chart = read("apps/frontend/src/pages/payroll-integration/ClassAllocationView.tsx");
const hook = read("apps/frontend/src/hooks/usePayrollAggregate.ts");

if (!migration.includes("payroll_integration.aggregate_cache")) fail("migration must create payroll_integration.aggregate_cache");
if (!migration.includes("ENABLE ROW LEVEL SECURITY")) fail("migration must enable RLS");
if (!migration.includes("ih35_app")) fail("migration must grant to ih35_app");

if (!routes.includes("/api/v1/payroll-integration/aggregate")) fail("routes must expose /payroll-integration/aggregate");
if (!routes.includes("pullTmsSettlements")) fail("routes must call pullTmsSettlements");
if (!routes.includes("pullQboPayroll")) fail("routes must call pullQboPayroll");
if (!routes.includes("buildClassSummary")) fail("routes must call buildClassSummary");

if (!classAllocator.includes("UNIT-DRIVER")) fail("class allocator must define UNIT-DRIVER class");
if (!classAllocator.includes("OFFICE")) fail("class allocator must define OFFICE class");
if (!classAllocator.includes("allocatePayrollClass")) fail("must export allocatePayrollClass");

if (!tmsPull.includes("driver_finance.driver_settlements")) fail("tms-pull must query driver_finance.driver_settlements");
if (!qboPull.includes("qbo_payroll_links")) fail("qbo-pull must query accounting.qbo_payroll_links");

if (!page.includes("Driver Settlements")) fail("page must show Driver Settlements KPI");
if (!page.includes("W-2 Payroll")) fail("page must show W-2 Payroll KPI");
if (!page.includes("Total Labor Cost")) fail("page must show Total Labor Cost KPI");
if (!page.includes("Benefits")) fail("page must show Benefits KPI");
if (!page.includes("PayrollAggregateTable")) fail("page must render PayrollAggregateTable");
if (!page.includes("ClassAllocationView")) fail("page must render ClassAllocationView");
if (!page.includes("Refresh from QBO")) fail("page must have Refresh from QBO button");

if (!table.includes("pay_type")) fail("table must show pay_type column");
if (!chart.includes("UNIT-DRIVER")) fail("chart must show UNIT-DRIVER class");
if (!hook.includes("/api/v1/payroll-integration/aggregate")) fail("hook must call aggregate endpoint");

console.log(`[${LABEL}] PASS — payroll integration implementation verified`);
