#!/usr/bin/env node
// Guard: the dispatch board's currency formatting can NEVER crash the List/Table grid on a no-load
// (truck-centric Awaiting) row. formatMoneyCents must return "—" on a missing amount and default the
// currency, and the board's Linehaul cell must route through it (no raw Intl.NumberFormat).
// House USD path must use formatUsdCents (lib/money); MXN may keep Intl.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-currency-format-guarded: ${m}`);
  process.exit(1);
};

const constants = read("apps/frontend/src/components/dispatch/constants.ts");
// formatMoneyCents accepts nullable amount and returns "—" on missing input.
if (!/formatMoneyCents\(valueCents: number \| null \| undefined/.test(constants)) {
  fail("formatMoneyCents must accept a nullable amount (number | null | undefined)");
}
if (!/if \(valueCents == null[\s\S]{0,80}return "—"/.test(constants)) fail("formatMoneyCents must return '—' on a null/NaN amount (no NumberFormat call)");
if (!/const cur = currency \|\| "USD"/.test(constants)) fail("formatMoneyCents must default a missing currency to USD (never pass blank/undefined to NumberFormat)");
if (!/from ["'][^"']*lib\/money["']/.test(constants) || !/formatUsdCents/.test(constants)) {
  fail("formatMoneyCents must import formatUsdCents from lib/money for the USD path");
}
if (!/cur === "MXN"/.test(constants)) fail("formatMoneyCents must keep an explicit MXN Intl branch");
if (!/return formatUsdCents\(valueCents\)/.test(constants)) fail("formatMoneyCents USD path must return formatUsdCents(valueCents)");

// The board's Linehaul cell routes through formatMoneyCents (no raw currency NumberFormat on the board).
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (/new Intl\.NumberFormat\([^)]*style:\s*["']currency/.test(board)) fail("DispatchBoard must NOT call Intl.NumberFormat(currency) directly — use formatMoneyCents");
if (!/linehaul[\s\S]{0,80}formatMoneyCents/.test(board)) fail("Linehaul cell must use formatMoneyCents");

// Book load wizard + settlement profitability: no per-file USD Intl money helper.
const book = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
if (/new Intl\.NumberFormat\([\s\S]{0,120}style:\s*["']currency["']/.test(book)) {
  fail("BookLoadModalV4 must NOT hand-roll Intl.NumberFormat currency — use formatUsdCents");
}
if (!/formatUsdCents\(customerInvoiceTotal\)/.test(book)) fail("BookLoadModalV4 invoice total must use formatUsdCents");

const profit = read("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx");
if (!/formatUsdCents/.test(profit) || !/from ["'][^"']*lib\/money["']/.test(profit)) {
  fail("SettlementProfitabilityCard must import formatUsdCents from lib/money");
}
if (!/cur === "MXN"/.test(profit)) fail("SettlementProfitabilityCard must keep an explicit MXN Intl branch");

// Cursor house-money wave — no per-file toFixed(2) / $ template USD money on these surfaces.
const earnings = read("apps/frontend/src/components/drivers/EarningsTab.tsx");
if (!/formatUsd/.test(earnings) || !/from ["'][^"']*lib\/money["']/.test(earnings)) {
  fail("EarningsTab must import formatUsd from lib/money");
}
if (/\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(earnings) || /`\$\$\{[^`]*toFixed\(2\)\}`/.test(earnings)) {
  fail("EarningsTab must not hand-roll $ + toFixed(2) money");
}

const fines = read("apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx");
if (!/formatUsd\(Math\.abs\(Number\(line\.amount\)\)\)/.test(fines)) {
  fail("FinesDeductionsCard pre-settlement lines must use formatUsd");
}
if (/−\$\$\{Math\.abs/.test(fines) || /−\$\$\{/.test(fines)) {
  fail("FinesDeductionsCard must not hand-roll −$ + toFixed money");
}

const quality = read("apps/frontend/src/components/dispatch/LoadQualityEventsReverseSection.tsx");
if (!/formatUsd\(Number\(event\.dollar_impact_amount\)\)/.test(quality)) {
  fail("LoadQualityEventsReverseSection must format dollar_impact via formatUsd");
}

const stops = read("apps/frontend/src/components/dispatch/LoadStopsRecordTab.tsx");
if (!/formatUsdCents\(stop\.lumper_amount_cents\)/.test(stops)) {
  fail("LoadStopsRecordTab lumper amount must use formatUsdCents");
}

const tourSettle = read("apps/frontend/src/components/dispatch/TourSettlementTab.tsx");
if (!/formatUsdRateTable\(c \/ 100\)/.test(tourSettle)) fail("TourSettlementTab rate must use formatUsdRateTable");
if (!/formatUsd\(c \/ 100\)\/mi/.test(tourSettle) && !/\$\{formatUsd\(c \/ 100\)\}\/mi/.test(tourSettle)) {
  fail("TourSettlementTab perMile must use formatUsd");
}

const customer = read("apps/frontend/src/pages/CustomerDetail.tsx");
if (!/formatUsd\(qualityStats\.totalImpact\)/.test(customer)) fail("CustomerDetail Dollar Impact KPI must use formatUsd");
if (!/formatUsdCents\(Number\(invoice\.total_cents/.test(customer)) fail("CustomerDetail invoice total must use formatUsdCents");
if (!/formatUsdCents\(lane\.fsc_per_mile_cents\)/.test(customer)) fail("CustomerDetail FSC/mi must use formatUsdCents");

const vendorParts = read("apps/frontend/src/pages/vendors/VendorPartsHistorySection.tsx");
if (!/formatUsd/.test(vendorParts) || /\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(vendorParts)) {
  fail("VendorPartsHistorySection must format invoice amount via formatUsd");
}
const unitParts = read("apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx");
if (!/formatUsd/.test(unitParts) || /\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(unitParts)) {
  fail("UnitPartsHistorySection must format invoice amount via formatUsd");
}
const stock = read("apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
if (!/formatUsd\(Number\(row\.unit_cost\)\)/.test(stock)) {
  fail("InventoryPartsStockPage unit_cost must use formatUsd");
}
const comparable = read("apps/frontend/src/components/vehicle-profile/ComparableUnitsWidget.tsx");
if (!/formatUsd\(cents \/ 100\)/.test(comparable)) {
  fail("ComparableUnitsWidget per-mile must use formatUsd");
}
const driverHub = read("apps/frontend/src/pages/home/DriverHubReportingPage.tsx");
if (!/formatUsdCents\(r\.approved_advance_cents\)/.test(driverHub)) {
  fail("DriverHubReportingPage CSV approved volume must use formatUsdCents");
}
if (/\(r\.approved_advance_cents \/ 100\)\.toFixed\(2\)/.test(driverHub)) {
  fail("DriverHubReportingPage must not hand-roll approved_advance_cents / 100 toFixed");
}


const cashAdvRev = read("apps/frontend/src/components/driver-profile/DriverCashAdvancesReverseSection.tsx");
if (!/formatUsdCents/.test(cashAdvRev) || !/formatUsd\(Number\(row\.amount/.test(cashAdvRev)) {
  fail("DriverCashAdvancesReverseSection must use formatUsdCents for requests and formatUsd for advances");
}
if (/requested_amount_cents[\s\S]{0,40}toFixed\(2\)/.test(cashAdvRev)) {
  fail("DriverCashAdvancesReverseSection must not treat requested_amount_cents as dollars via toFixed");
}
const settleFin = read("apps/frontend/src/components/driver-profile/DriverSettlementFinanceReverseSection.tsx");
if (!/formatUsdCents\(d\.disputed_amount_cents\)/.test(settleFin)) fail("DriverSettlementFinanceReverseSection disputed amount must use formatUsdCents");
if (!/formatUsd\(Number\(l\.current_balance/.test(settleFin)) fail("DriverSettlementFinanceReverseSection liability balance must use formatUsd");
const disputeList = read("apps/frontend/src/pages/drivers/SettlementDisputeList.tsx");
if (!/formatUsdCents\(cents \?\? 0\)/.test(disputeList)) fail("SettlementDisputeList must use formatUsdCents");
const totals = read("apps/frontend/src/components/forms/shared/TotalsStack.tsx");
if (!/formatUsd\(subtotal\)/.test(totals) || !/formatUsd\(total\)/.test(totals)) fail("TotalsStack must use formatUsd");
const chat = read("apps/frontend/src/pages/chat/DispatchChatPage.tsx");
if (!/formatUsdCents\(m\.cash_advance_amount_cents\)/.test(chat)) fail("DispatchChatPage cash advance card must use formatUsdCents");
const costs = read("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx");
if (!/formatUsdRateTable\(Number\(cents\) \/ 100\)/.test(costs)) fail("LoadDetailCostsTab fmtRate must use formatUsdRateTable");

// The regression test exists (renders a no-load row's currency path).
read("apps/frontend/src/components/dispatch/constants.money.test.ts");

console.log("PASS verify-currency-format-guarded");
