#!/usr/bin/env node
/**
 * Static guard: Settlements header + list/detail must surface open (unsettled) driver bills,
 * so driver pay is visible instead of appearing stuck at $0.
 *
 * Also bans EntityLink kind=bill on open driver_finance.driver_bills rows
 * (LIVE twin of LV-LOAD-DRIVER-PAY-AP-BILL-404 → /accounting/bills/:id bill_not_found).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-open-driver-bills";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function check() {
  const errors = [];

  const backend = read("apps/backend/src/driver-finance/driver-bills.routes.ts");
  if (!backend.includes('"/api/v1/driver-finance/driver-bills/open"')) {
    errors.push("Missing backend GET /api/v1/driver-finance/driver-bills/open route");
  }
  if (!/db\.status\s*=\s*['"]open['"]/.test(backend)) {
    errors.push("Backend open-bills route does not filter driver_bills.status = 'open'");
  }
  if (!backend.includes("total_count") || !backend.includes("total_gross_cents") || !backend.includes("items: payload.bills")) {
    errors.push("Backend open-bills response missing total_count / total_gross_cents / items");
  }

  const api = read("apps/frontend/src/api/driverFinance.ts");
  if (!api.includes("export function getOpenDriverBills")) {
    errors.push("Frontend API missing getOpenDriverBills export");
  }
  if (!api.includes("OpenDriverBill")) {
    errors.push("Frontend API missing OpenDriverBill type");
  }

  const listPage = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  if (!listPage.includes("getOpenDriverBills")) {
    errors.push("SettlementsPage does not import getOpenDriverBills");
  }
  if (!listPage.includes("OpenDriverBillsPanel")) {
    errors.push("SettlementsPage does not render OpenDriverBillsPanel");
  }
  if (!listPage.includes("Open Driver Bills")) {
    errors.push("SettlementsPage missing 'Open Driver Bills' KPI label");
  }
  if (!/totalCount|totalGrossCents/.test(listPage)) {
    errors.push("SettlementsPage open-bills panel does not receive totals");
  }
  if (/<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/.test(listPage)) {
    errors.push("SettlementsPage must not EntityLink kind=bill for open driver_finance.driver_bills rows");
  }

  const detailPage = read("apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
  if (!detailPage.includes("getOpenDriverBills")) {
    errors.push("SettlementDetailPage does not import getOpenDriverBills");
  }
  if (!detailPage.includes("OpenDriverBillsSection")) {
    errors.push("SettlementDetailPage does not render OpenDriverBillsSection");
  }
  if (!/totalCount|totalGrossCents/.test(detailPage)) {
    errors.push("SettlementDetailPage open-bills section does not receive totals");
  }
  const openSectionMatch = detailPage.match(/function OpenDriverBillsSection[\s\S]*?\nfunction /);
  const openSection = openSectionMatch
    ? openSectionMatch[0]
    : detailPage.match(/function OpenDriverBillsSection[\s\S]*$/)?.[0] ?? "";
  if (!openSection.includes("OpenDriverBillsSection")) {
    errors.push("SettlementDetailPage OpenDriverBillsSection function not found for AP-bill ban check");
  } else if (/<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/.test(openSection)) {
    errors.push("OpenDriverBillsSection must not EntityLink kind=bill for driver_finance.driver_bills");
  }

  return errors;
}

function main() {
  const errors = check();
  if (errors.length > 0) {
    for (const e of errors) console.error(`[${LABEL}] FAIL:`, e);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS: Settlements open driver bills visibility wired`);
}

if (process.argv.includes("--selftest")) {
  const listAbs = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const orig = fs.readFileSync(listAbs, "utf8");
  const injected = orig.replace(
    /(<EntityLink\s+kind="driver")/,
    '<EntityLink kind="bill" id={bill.id} label="BAD" />$1'
  );
  if (injected === orig) {
    console.error(`[${LABEL}] --selftest could not plant kind=bill`);
    process.exit(1);
  }
  fs.writeFileSync(listAbs, injected);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status === 0) {
      console.error(`[${LABEL}] --selftest FAIL: planted kind=bill still passed`);
      process.exit(1);
    }
    console.log(`[${LABEL}] --selftest PASS: planted kind=bill failed closed`);
  } finally {
    fs.writeFileSync(listAbs, orig);
  }
  process.exit(0);
}

main();
