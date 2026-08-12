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
// FIX: both KPI strips now branch on the same isError flag that already drives their list's
// ListErrorBanner. On error every tile shows "—" (BillsPage) or the KpiCard's value prop is "—"
// (SettlementsPage) instead of a fabricated zero.
//
// This guard is a static source assertion — no DB needed — checking both files render an
// error-aware branch instead of computing straight through to money(...)/count on every tile.
import fs from "node:fs";

const BILLS_PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const SETTLEMENTS_PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";

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

  console.log(`PASS verify-money-kpi-strip-no-fake-zero-on-error --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkBillsPage(fs.readFileSync(BILLS_PAGE, "utf8"));
  checkSettlementsPage(fs.readFileSync(SETTLEMENTS_PAGE, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-money-kpi-strip-no-fake-zero-on-error");
  }
}
