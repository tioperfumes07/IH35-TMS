#!/usr/bin/env node
/**
 * Static guard: Settlements header + list/detail must surface open (unsettled) driver bills,
 * so driver pay is visible instead of appearing stuck at $0.
 *
 * FAIL conditions:
 *  - backend route missing or does not query status='open'
 *  - response shape missing total_count / total_gross_cents / items
 *  - frontend API does not expose getOpenDriverBills
 *  - SettlementsPage does not render an open-bills panel
 *  - SettlementDetailPage does not render an open-bills section
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const errors = [];

// Backend route and query shape
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

// Frontend API
const api = read("apps/frontend/src/api/driverFinance.ts");
if (!api.includes("export function getOpenDriverBills")) {
  errors.push("Frontend API missing getOpenDriverBills export");
}
if (!api.includes("OpenDriverBill")) {
  errors.push("Frontend API missing OpenDriverBill type");
}

// Settlements list page
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

// Settlement detail page
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

if (errors.length > 0) {
  for (const e of errors) {
    console.error("FAIL:", e);
  }
  process.exit(1);
}

console.log("PASS: Settlements open driver bills visibility wired");
process.exit(0);
