#!/usr/bin/env node
/**
 * ROUND 298.1 — C-31..C-35
 * Customers/Vendors default = With transactions (A-21 server predicate).
 * KPI strip is a horizontal tile grid (not full-width stacked rows).
 * Money formatters never emit "-$0.00".
 * Drivers module: Permits/Deductions/Disputes are not peer tabs (Round 296 / C-33).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/verify-list-defaults-and-kpi-shape.mjs --selftest");
  process.exit(0);
}

// --- C-31: default list is With transactions via A-21 shared predicate ---
const predicate = read("apps/backend/src/accounting/has-transactions-predicate.ts");
if (!predicate.includes("export function customerHasTransactionsSql")) {
  fail("A-21 customerHasTransactionsSql missing");
}
if (!predicate.includes("export function vendorHasTransactionsSql")) {
  fail("A-21 vendorHasTransactionsSql missing");
}
if (!predicate.includes("status NOT IN ('proforma', 'void')")) {
  fail("A-21 customer predicate must exclude voided invoices");
}
ok("C-31 A-21 shared predicate present");

for (const [rel, label] of [
  ["apps/frontend/src/pages/Customers.tsx", "Customers"],
  ["apps/frontend/src/pages/Vendors.tsx", "Vendors"],
]) {
  const src = read(rel);
  if (!src.includes('data-c31-list-default=')) fail(`${label}: missing data-c31-list-default marker`);
  if (!src.includes("With transactions")) fail(`${label}: With transactions tab label missing from subnav`);
  if (!src.includes("has_transactions: true")) fail(`${label}: must pass has_transactions:true to list API`);
  if (!src.includes("with_transactions")) fail(`${label}: default listTab id with_transactions missing`);
  // Must not invent a client-side has-txn filter as the default.
  if (/filter\(\([^)]*\)\s*=>\s*[^)]*(open_balance|hasTxn|has_txn|transaction_count)/i.test(src)) {
    fail(`${label}: client-side has-transactions invent — use A-21 server predicate only`);
  }
  // Default must not be Active/all without the with_transactions tab.
  if (/listTab\)\s*\?\?\s*"active"|\#\#\s*"active"\)|get\("listTab"\)\s*\?\?\s*"active"/.test(src) && !src.includes("with_transactions")) {
    fail(`${label}: still defaults listTab to active`);
  }
  ok(`C-31 ${label} defaults With transactions via A-21`);
}

const custRoutes = read("apps/backend/src/mdata/customers.routes.ts");
const vendRoutes = read("apps/backend/src/mdata/vendors.routes.ts");
if (!custRoutes.includes("customerHasTransactionsSql(")) fail("customers.routes must call shared customerHasTransactionsSql");
if (!vendRoutes.includes("vendorHasTransactionsSql(")) fail("vendors.routes must call shared vendorHasTransactionsSql");
ok("C-31 backend routes import A-21 predicates");

// --- C-32: KPI strip is a grid, not full-width stacked rows ---
const kpiStrip = read("apps/frontend/src/components/layout/KpiStrip.tsx");
if (!kpiStrip.includes("grid-cols-6") && !kpiStrip.includes("lg:grid-cols-6")) {
  fail("KpiStrip must use a 6-column grid on desktop");
}
if (!kpiStrip.includes('data-c32-kpi-row="true"')) fail("KpiStrip missing data-c32-kpi-row");
if (kpiStrip.includes("flex w-full flex-wrap") && !kpiStrip.includes("grid")) {
  fail("KpiStrip still uses flex-wrap stack (must be grid)");
}
ok("C-32 KpiStrip is a horizontal tile grid");

const kpiCard = read("apps/frontend/src/components/layout/KpiCard.tsx");
if (!kpiCard.includes("flex-col")) fail("KpiCard must stack label above value (flex-col)");
if (!kpiCard.includes("tabular-nums")) fail("KpiCard value must use tabular-nums");
if (!kpiCard.includes("text-left")) fail("KpiCard value must be left-aligned");
if (kpiCard.includes("justify-between") && kpiCard.includes("items-center") && !kpiCard.includes("flex-col")) {
  fail("KpiCard still renders as a full-width bar with value on the far right");
}
ok("C-32 KpiCard is a tile (label above, value left)");

// --- C-35: money never emits -$0.00 ---
const money = read("apps/frontend/src/lib/money.ts");
if (!money.includes("usdFormatNoNegativeZero")) fail("money.ts missing usdFormatNoNegativeZero");
if (!money.includes("Object.is(dollars, -0)") && !money.includes("Object.is(dollars, -0)")) {
  fail("money.ts must guard IEEE -0");
}
if (!money.includes("Math.abs(dollars) < 0.005")) fail("money.ts must round near-zero to $0.00");
// Drivers.tsx must not prefix a literal "-" before formatMoney (that printed "-$0.00").
const driversPage = read("apps/frontend/src/pages/Drivers.tsx");
if (/Total outstanding:\s*-?\$\{/.test(driversPage) && driversPage.includes("-${formatMoney")) {
  fail("Drivers.tsx still prefixes '-' before formatMoney (produces -$0.00)");
}
if (driversPage.includes("-${formatMoney") || driversPage.includes(">-${formatMoney")) {
  fail("Drivers.tsx still concatenates '-' + formatMoney");
}
ok("C-35 money formatter cannot emit -$0.00");

// --- C-33: Permits / Deductions / Disputes not peer tabs ---
const tabsConfig = read("apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts");
if (/id:\s*"permits"/.test(tabsConfig)) fail("DRIVERS_SUBNAV must not include Permits (unit-keyed)");
if (/id:\s*"deductions"/.test(tabsConfig)) fail("DRIVERS_SUBNAV must not include Deductions as a peer tab");
if (/id:\s*"disputes"/.test(tabsConfig)) fail("DRIVERS_SUBNAV must not include Disputes as a peer tab");
if (!tabsConfig.includes('id: "cash_advance_requests"')) {
  fail("Cash advance requests must join the module tab bar");
}
if (!driversPage.includes('data-c33-filter-band="true"')) {
  fail("Drivers page missing C-33 single filter band");
}
if (driversPage.includes("DriversCashAdvanceRequestsLink")) {
  fail("Drivers still renders a full-width Cash advance requests band");
}
ok("C-33 Drivers peer tabs reshaped (no Permits/Deductions/Disputes)");

// --- C-34: profiles list / master renders rows ---
const sidebar = read("apps/frontend/src/pages/drivers/DriverListSidebar.tsx");
if (!sidebar.includes("drivers-profiles-master-table")) {
  fail("DriverListSidebar must render a tbody table (C-34)");
}
if (!sidebar.includes("onSelectDriver(first.id)")) {
  fail("DriverListSidebar must auto-select first driver after load");
}
const listPage = read("apps/frontend/src/pages/drivers/DriversListPage.tsx");
if (!listPage.includes("embedded")) fail("DriversListPage must support embedded mode (no duplicate KPI stack)");
ok("C-34 profiles master renders tbody rows + auto-select");

console.log("verify-list-defaults-and-kpi-shape --selftest OK");
