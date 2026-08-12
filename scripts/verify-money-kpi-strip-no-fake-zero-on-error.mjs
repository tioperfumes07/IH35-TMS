#!/usr/bin/env node
// CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE (verify-step 3151).
//
// ROOT CAUSE this closes: BillsPage.tsx's KPI strip rendered `money(billKpis.openAmount)` etc.
// unconditionally — billKpis is a useMemo derived purely from `billsQuery.data?.rows ?? []`, so the
// instant billsQuery errored, every tile fell back to a real-looking "$0.00 · 0 open" instead of
// surfacing the failure the ListErrorBanner three lines below already knew about. SettlementsPage.tsx
// had the identical shape: kpis.* derived from kpiSettlements (kpiBaseQuery.data ?? []) and
// open_driver_bills from openBillsSummary (openBillsQuery.data ?? {total_count: 0}) — both silently
// zeroed on error while a separate banner rendered underneath. A user glancing at the KPI tiles alone
// (the whole point of a KPI strip — fast, no-read-required signal) would see "0 open bills" / "0
// drivers with debt" and reasonably conclude there is nothing to act on, when the truth is the fetch
// failed and the real number is unknown. This is a silent-false-negative on money data.
//
// CLS-MONEY-KPI-FAKE-ZERO-REMAINDER-INVOICES-EXPENSES — the original finding named FOUR surfaces
// (Bills, Settlements, Invoices A/R, Expenses); only the first two were fixed here initially. The
// class was never generalized, so InvoicesListPage.tsx and ExpensesListPage.tsx kept the identical
// bug: totals computed straight from query.data with no isError awareness, next to a ListErrorBanner
// that already knew the fetch had failed. Extended here rather than shipping a third/fourth
// standalone guard.
//
// FIX: all four totals surfaces now branch on the same isError flag that already drives their list's
// ListErrorBanner. On error every value shows "—" instead of a fabricated zero.
//
// CLS-MONEY-KPI-FAKE-ZERO-REMAINDER-FACTORING-MAINT (Cursor #this): FactoringHome summary KPI row
// still called fmtCurrency(summary?.…) while ListErrorBanner already knew summaryQuery failed —
// fabricated $0.00 / default recourse days. MaintenanceHome substituted a full zero KPI object on
// missing data so Open WOs rendered 0 next to a loaded WO table (Cascade LV-MAINTENANCE-KPI).
// Extended here rather than a new verify-step number (Rule 17 / no hotfile thrash).
import fs from "node:fs";

const BILLS_PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const SETTLEMENTS_PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
const INVOICES_PAGE = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";
const EXPENSES_PAGE = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const FACTORING_HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const MAINT_HOME = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const MAINT_KPI_ROWS = "apps/frontend/src/pages/maintenance/components/MaintKpiRows.tsx";

function fail(msg) {
  console.error(`FAIL verify-money-kpi-strip-no-fake-zero-on-error: ${msg}`);
  process.exitCode = 1;
}

function checkBillsPage(src) {
  if (!src.includes("kpiStrip={")) {
    fail(`${BILLS_PAGE}: kpiStrip prop not found — did the KPI strip move?`);
    return;
  }
  const kpiStripStart = src.indexOf("kpiStrip={");
  const kpiStripBlock = src.slice(kpiStripStart, kpiStripStart + 1400);
  if (!kpiStripBlock.includes("billsQuery.isError")) {
    fail(`${BILLS_PAGE}: kpiStrip block does not branch on billsQuery.isError — KPI tiles will show $0.00 on a failed fetch, not an error state.`);
    return;
  }
  if (!/billKpiCard\(\s*"Open Bills"\s*,\s*"—"/.test(kpiStripBlock)) {
    fail(`${BILLS_PAGE}: no "—" fallback tile found for the billsQuery.isError branch.`);
  }
}

function checkSettlementsPage(src) {
  const kpisIdx = src.indexOf("const kpis: Record<string, number | string>");
  if (kpisIdx === -1) {
    fail(`${SETTLEMENTS_PAGE}: kpis object is no longer typed number | string — the "—" fallback was likely reverted.`);
    return;
  }
  const kpisBlock = src.slice(kpisIdx, kpisIdx + 900);
  if (!kpisBlock.includes('kpiBaseQuery.isError ? "—"')) {
    fail(`${SETTLEMENTS_PAGE}: kpis fields no longer branch on kpiBaseQuery.isError — settlement KPI counts will silently zero on a failed fetch.`);
  }
  if (!kpisBlock.includes('openBillsQuery.isError ? "—"')) {
    fail(`${SETTLEMENTS_PAGE}: open_driver_bills no longer branches on openBillsQuery.isError.`);
  }
  if (!/value:\s*number\s*\|\s*string/.test(src)) {
    fail(`${SETTLEMENTS_PAGE}: KpiCard's value prop is no longer typed to accept the "—" string fallback.`);
  }
}

function checkInvoicesPage(src) {
  if (!src.includes("Total billed:")) {
    fail(`${INVOICES_PAGE}: "Total billed:" strip not found — did it move?`);
    return;
  }
  if (!/Total billed:\s*\{query\.isError/.test(src)) {
    fail(`${INVOICES_PAGE}: "Total billed" no longer branches directly on query.isError — will show $0.00 on a failed fetch, not an error state.`);
  }
  if (!/Open:\s*\{query\.isError/.test(src)) {
    fail(`${INVOICES_PAGE}: "Open" total no longer branches directly on query.isError — will show $0.00 on a failed fetch, not an error state.`);
  }
}

function checkExpensesPage(src) {
  if (!src.includes("Total: {")) {
    fail(`${EXPENSES_PAGE}: "Total:" strip not found — did it move?`);
    return;
  }
  if (!/Total:\s*\{query\.isError/.test(src)) {
    fail(`${EXPENSES_PAGE}: "Total" no longer branches directly on query.isError — will show $0.00 on a failed fetch, not an error state.`);
  }
}

function checkFactoringHome(src) {
  if (!src.includes('data-testid="factoring-home-kpi-row"')) {
    fail(`${FACTORING_HOME}: factoring-home-kpi-row not found — did the summary KPI strip move?`);
    return;
  }
  const start = src.indexOf('data-testid="factoring-home-kpi-row"');
  const block = src.slice(start, start + 1600);
  if (!block.includes("summaryQuery.isError")) {
    fail(`${FACTORING_HOME}: KPI row does not branch on summaryQuery.isError — reserve/chargeback tiles will show fabricated currency on a failed fetch.`);
  }
  if (!/summaryQuery\.isError\s*\?\s*"—"\s*:\s*fmtCurrency\(summary\?\.reserve_balance\)/.test(block)) {
    fail(`${FACTORING_HOME}: Reserve Balance tile missing summaryQuery.isError ? "—" : fmtCurrency(...) branch.`);
  }
}

function checkMaintenanceHome(src, rowsSrc) {
  if (/kpisQuery\.data\s*\?\?\s*\{[\s\S]{0,400}open_wos:\s*0/.test(src)) {
    fail(`${MAINT_HOME}: still uses kpisQuery.data ?? { open_wos: 0, … } — reintroduces fake zeros on missing/error data.`);
  }
  if (!src.includes("kpisQuery.isError")) {
    fail(`${MAINT_HOME}: must branch on kpisQuery.isError when building the KPI object.`);
  }
  if (!src.includes("isError={kpisQuery.isError}")) {
    fail(`${MAINT_HOME}: MaintKpiRows must be passed isError={kpisQuery.isError}.`);
  }
  if (!rowsSrc.includes("isError ? null : pick(kpis.open_wos)")) {
    fail(`${MAINT_KPI_ROWS}: Open WOs tile must null out when isError.`);
  }
}

function selftest() {
  const originalBills = fs.readFileSync(BILLS_PAGE, "utf8");
  const originalSettlements = fs.readFileSync(SETTLEMENTS_PAGE, "utf8");
  let probesProven = 0;

  // Mutation 1: drop the billsQuery.isError branch from BillsPage's kpiStrip.
  {
    const kpiStripStart = originalBills.indexOf("kpiStrip={");
    const braceEnd = originalBills.indexOf("      }", kpiStripStart);
    const mutated =
      originalBills.slice(0, kpiStripStart) +
      `kpiStrip={\n        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">\n          {billKpiCard("Open Bills", money(billKpis.openAmount), \`\${billKpis.openCount} open\`)}\n        </div>\n      }` +
      originalBills.slice(braceEnd + "      }".length);
    fs.writeFileSync(BILLS_PAGE, mutated);
    let caught = false;
    try {
      checkBillsPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(BILLS_PAGE, originalBills);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping billsQuery.isError branch was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: drop kpiBaseQuery.isError branch from SettlementsPage's kpis object.
  {
    const mutated = originalSettlements.replace(
      /kpiBaseQuery\.isError \? "—" : /g,
      ""
    );
    if (mutated === originalSettlements) {
      console.error("SELFTEST SETUP FAILED: kpiBaseQuery.isError pattern not found to mutate.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(SETTLEMENTS_PAGE, mutated);
    let caught = false;
    try {
      checkSettlementsPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(SETTLEMENTS_PAGE, originalSettlements);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping kpiBaseQuery.isError branch was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 3: drop query.isError from InvoicesListPage's totals strip.
  {
    const original = fs.readFileSync(INVOICES_PAGE, "utf8");
    const mutated = original.replace(
      'Total billed: {query.isError ? "—" : money(totals.total)}',
      "Total billed: {money(totals.total)}"
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: InvoicesListPage totals pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(INVOICES_PAGE, mutated);
    let caught = false;
    try {
      checkInvoicesPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(INVOICES_PAGE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping query.isError from InvoicesListPage was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 4: drop query.isError from ExpensesListPage's totals strip.
  {
    const original = fs.readFileSync(EXPENSES_PAGE, "utf8");
    const mutated = original.replace(
      'Total: {query.isError ? "—" : money(totals.total)}',
      "Total: {money(totals.total)}"
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: ExpensesListPage totals pattern not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(EXPENSES_PAGE, mutated);
    let caught = false;
    try {
      checkExpensesPage(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(EXPENSES_PAGE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping query.isError from ExpensesListPage was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 5: FactoringHome KPI row loses summaryQuery.isError branches.
  {
    const original = fs.readFileSync(FACTORING_HOME, "utf8");
    const mutated = original
      .replace(/summaryQuery\.isError \? "—" : \(summary\?\.active_factor_name \?\? "Not configured"\)/g, 'summary?.active_factor_name ?? "Not configured"')
      .replace(/summaryQuery\.isError \? "—" : fmtCurrency\(summary\?\.reserve_balance\)/g, "fmtCurrency(summary?.reserve_balance)")
      .replace(/summaryQuery\.isError \? "—" : fmtCurrency\(summary\?\.chargeback_balance\)/g, "fmtCurrency(summary?.chargeback_balance)")
      .replace(/summaryQuery\.isError \? "—" : Number\(summary\?\.recourse_days \?\? 95\)/g, "Number(summary?.recourse_days ?? 95)");
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: FactoringHome summaryQuery.isError patterns not found.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FACTORING_HOME, mutated);
    let caught = false;
    try {
      checkFactoringHome(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FACTORING_HOME, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: dropping FactoringHome summaryQuery.isError was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 6: MaintenanceHome reverts to zero-object fallback.
  {
    const original = fs.readFileSync(MAINT_HOME, "utf8");
    const originalRows = fs.readFileSync(MAINT_KPI_ROWS, "utf8");
    const mutated = original.replace(
      /kpisQuery\.isError \? \(\{\} as NonNullable<typeof kpisQuery\.data>\) : \(kpisQuery\.data \?\? \(\{\} as NonNullable<typeof kpisQuery\.data>\)\)/,
      `kpisQuery.data ?? { open_wos: 0, in_shop: 0, past_due_pm: 0, out_of_service: 0, open_damage: 0, avg_wo_age_days: 0, mtd_repair_cost: 0, mtd_parts_cost: 0, avg_wo_cost: 0, top_vendor: null, top_failure: null, pending_qbo: 0, past_due: 0, avg_close_days: 0, open_dollars: 0, tire_alerts: 0, pm_due: 0, dot_oos: 0, in_progress: 0, waiting_parts: 0, severe_oos: 0, road_service: 0, parts_low_stock: 0 }`
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: MaintenanceHome isError KPI branch not found to mutate.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(MAINT_HOME, mutated);
    let caught = false;
    try {
      checkMaintenanceHome(mutated, originalRows);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(MAINT_HOME, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: restoring MaintenanceHome zero-object fallback was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-money-kpi-strip-no-fake-zero-on-error --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkBillsPage(fs.readFileSync(BILLS_PAGE, "utf8"));
  checkSettlementsPage(fs.readFileSync(SETTLEMENTS_PAGE, "utf8"));
  checkInvoicesPage(fs.readFileSync(INVOICES_PAGE, "utf8"));
  checkExpensesPage(fs.readFileSync(EXPENSES_PAGE, "utf8"));
  checkFactoringHome(fs.readFileSync(FACTORING_HOME, "utf8"));
  checkMaintenanceHome(fs.readFileSync(MAINT_HOME, "utf8"), fs.readFileSync(MAINT_KPI_ROWS, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-money-kpi-strip-no-fake-zero-on-error");
  }
}
