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
// ACCT-F5654 — the loose, schema-unqualified `.includes("qbo_payroll_links")` check below used to
// pass whether qbo-pull queried the real table or a phantom one, so it never actually verified
// anything. `accounting.qbo_payroll_links` has NEVER existed in any migration; the only table ever
// created is `integrations.qbo_payroll_links` (migration 0371), and per
// scripts/verify-phantom-relations.mjs's own HOLD note it is a per-payroll-run aggregate
// (qbo_payroll_run_id/gross_cents/net_cents/employee_count), not the per-employee shape this
// module's code assumes — a genuine data-model mismatch pending an owner decision, not something
// this guard can silently wave through as "verified." Require the correct schema-qualified table and
// explicitly reject the phantom one, so this guard fails honestly until the underlying code (and the
// data-model decision it's blocked on) is actually fixed — never PASS over code that would throw
// `relation "accounting.qbo_payroll_links" does not exist` on its first real query. Not fixing the
// dormant application code itself here: the route is HELD-FOR-OWNER/unmounted and this guard is not
// wired into CI (scripts/.guard-exempt.json), so there is no live blast radius today — the fix scope
// for THIS PR is restoring honest guard behavior, not making an owner data-model call unilaterally.
if (qboPull.includes("accounting.qbo_payroll_links")) {
  fail("qbo-pull must NOT query the phantom accounting.qbo_payroll_links (never existed in any migration) — see verify-phantom-relations.mjs's HOLD note; the real table is integrations.qbo_payroll_links, and its per-run shape still needs an owner data-model decision before this code can be correct");
}
if (!qboPull.includes("integrations.qbo_payroll_links")) fail("qbo-pull must query the real, schema-qualified integrations.qbo_payroll_links");

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
