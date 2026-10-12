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
const page = read("apps/frontend/src/pages/payroll-integration/PayrollIntegrationPage.tsx");
const table = read("apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx");
const chart = read("apps/frontend/src/pages/payroll-integration/ClassAllocationView.tsx");
const hook = read("apps/frontend/src/hooks/usePayrollAggregate.ts");

if (!migration.includes("payroll_integration.aggregate_cache")) fail("migration must create payroll_integration.aggregate_cache");
if (!migration.includes("ENABLE ROW LEVEL SECURITY")) fail("migration must enable RLS");
if (!migration.includes("ih35_app")) fail("migration must grant to ih35_app");

if (!routes.includes("/api/v1/payroll-integration/aggregate")) fail("routes must expose /payroll-integration/aggregate");
if (!routes.includes("pullTmsSettlements")) fail("routes must call pullTmsSettlements");
// ACCT-F4431379 (Lead 443.137 9d) — old: "routes must call pullQboPayroll"; new: routes must NOT;
// why: driver pay comes ONLY from driver_finance, QBO is out of scope for USMCA, and there is no
// explicit payroll reconciliation screen — the QBO pull was being added into grand_total.
if (routes.includes("pullQboPayroll")) fail("routes must NOT call pullQboPayroll — labor totals come from driver_finance only");
if (fs.existsSync(path.join(ROOT, "apps/backend/src/payroll-integration/qbo-payroll-pull.ts"))) {
  fail("payroll-integration/qbo-payroll-pull.ts must stay deleted — QBO payroll is never a source of driver pay");
}
if (!routes.includes("buildClassSummary")) fail("routes must call buildClassSummary");

if (!classAllocator.includes("UNIT-DRIVER")) fail("class allocator must define UNIT-DRIVER class");
if (!classAllocator.includes("OFFICE")) fail("class allocator must define OFFICE class");
if (!classAllocator.includes("allocatePayrollClass")) fail("must export allocatePayrollClass");

if (!tmsPull.includes("driver_finance.driver_settlements")) fail("tms-pull must query driver_finance.driver_settlements");
// ACCT-F5654 required qbo-pull to read integrations.qbo_payroll_links instead of the phantom
// accounting.* table. ACCT-F4431379 (Lead 443.137 9d) supersedes it — old: "qbo-pull must query
// integrations.qbo_payroll_links"; new: qbo-pull is deleted (checked above) and the TMS pull must
// read the canonical DOLLAR columns; why: the module now sources pay from driver_finance only, and
// the TMS pull selected phantom *_cents columns that threw 42703 on the first query.
if (/ds\.(gross_pay_cents|total_deductions_cents|net_pay_cents)\b/.test(tmsPull)) {
  fail("tms-pull must not select phantom *_cents columns — the canonical header stores dollars (gross_pay/deductions_total/net_pay)");
}
if (!/ROUND\(ds\.gross_pay \* 100\)/.test(tmsPull)) fail("tms-pull must convert gross_pay dollars to cents via ROUND(ds.gross_pay * 100)");

if (!page.includes("Driver Settlements")) fail("page must show Driver Settlements KPI");
// ACCT-F4431379 — old: page must show "W-2 Payroll" / "Benefits" KPIs and a "Refresh from QBO"
// button; new: it must NOT; why: those KPIs were QBO Payroll figures added into Total Labor Cost.
if (page.includes("W-2 Payroll") || page.includes("w2_total")) fail("page must not show a QBO W-2 Payroll KPI");
if (!page.includes("Total Labor Cost")) fail("page must show Total Labor Cost KPI");
if (page.includes("data.benefits")) fail("page must not show a QBO Benefits KPI");
if (!page.includes("PayrollAggregateTable")) fail("page must render PayrollAggregateTable");
if (!page.includes("ClassAllocationView")) fail("page must render ClassAllocationView");
if (page.includes("Refresh from QBO")) fail("page must not offer a Refresh from QBO button");

if (!table.includes("pay_type")) fail("table must show pay_type column");
if (!chart.includes("UNIT-DRIVER")) fail("chart must show UNIT-DRIVER class");
if (!hook.includes("/api/v1/payroll-integration/aggregate")) fail("hook must call aggregate endpoint");

console.log(`[${LABEL}] PASS — payroll integration implementation verified`);
