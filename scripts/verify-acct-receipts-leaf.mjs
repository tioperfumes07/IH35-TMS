#!/usr/bin/env node
/**
 * Guard: Accounting wave 19/22 — Receipts payment proof + Undeposited Funds nav leaf.
 * Receive Payment deposit CoA (ops_checking kill) is owned by PR #3238 — not asserted here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
const manifest = read("apps/frontend/src/routes/manifest.tsx");
const receiptsPage = read("apps/frontend/src/pages/accounting/ReceiptsPage.tsx");
const receiptsRoutes = read("apps/backend/src/accounting/receipts.routes.ts");
const receiptsApi = read("apps/frontend/src/api/receipts.ts");
const ufPage = read("apps/frontend/src/pages/accounting/UndepositedFundsPage.tsx");

if (!subnav.includes('label: "Receipts", path: "/accounting/receipts"')) {
  fail("SUBNAV_ITEMS must register Receipts at /accounting/receipts");
}
if (!subnav.includes('label: "Undeposited Funds", path: "/accounting/undeposited-funds"')) {
  fail("SUBNAV_ITEMS must register Undeposited Funds leaf");
}
if (!manifest.includes('path="/accounting/receipts"') || /path="\/accounting\/receipts"[\s\S]{0,160}ComingSoonPage/.test(manifest)) {
  fail("/accounting/receipts must mount ReceiptsPage, not ComingSoonPage");
}
if (!manifest.includes('path="/accounting/undeposited-funds"') || !manifest.includes("UndepositedFundsPage")) {
  fail("/accounting/undeposited-funds must mount UndepositedFundsPage");
}
if (receiptsPage.includes("<ComingSoonPage")) fail("ReceiptsPage must not render ComingSoonPage");
if (!receiptsPage.includes("Customer payments")) fail("ReceiptsPage filter must include customer payments");
if (!receiptsPage.includes('value="payment"')) fail("ReceiptsPage filter must include payment entity_type option");
if (!receiptsRoutes.includes("entity_type = 'payment'")) {
  fail("receipts.routes must join accounting.payments for customer payment proof");
}
if (!receiptsRoutes.includes("check_image") || !receiptsRoutes.includes("ach_confirmation")) {
  fail("receipts.routes must include payment proof attachment categories");
}
if (!receiptsRoutes.includes('type: "payment"')) {
  fail("receipts.routes must map payment source in API response");
}
if (!receiptsApi.includes('type: "payment"')) {
  fail("receipts.ts API types must include payment source");
}
if (!ufPage.includes("undeposited_funds") || !ufPage.includes("account-register")) {
  fail("UndepositedFundsPage must resolve UF role and deep-link account register");
}

// ACCT-F443293-C — V3 board grammar on Receipts (Bills first-tab parity).
if (!receiptsPage.includes("MoneyListToolbar")) {
  fail("ReceiptsPage must use MoneyListToolbar (FILTER-MULTI-01)");
}
if (
  !receiptsPage.includes("kpiStrip=") ||
  !receiptsPage.includes('data-testid="receipts-kpi-strip"') ||
  !receiptsPage.includes("moneyListKpiCard")
) {
  fail("ReceiptsPage must pass AccountingSubNavWrapper kpiStrip with receipts-kpi-strip + moneyListKpiCard");
}
if (receiptsPage.includes("CollapsedListFilters")) {
  fail("ReceiptsPage must not use CollapsedListFilters");
}
if (!receiptsPage.includes('searchTestId="receipts-search"')) {
  fail("ReceiptsPage search must use MoneyListToolbar searchTestId receipts-search");
}
if (!receiptsPage.includes("createControl=")) {
  fail("ReceiptsPage must use AccountingSubNavWrapper createControl for + New receipt (Bills parity)");
}
if (!receiptsPage.includes('data-receipts-filter-toolbar="visible"')) {
  fail("ReceiptsPage filter bar must keep data-receipts-filter-toolbar for QBO collapse guard");
}

const fixedAssetsPage = read("apps/frontend/src/pages/accounting/FixedAssetsPage.tsx");
if (fixedAssetsPage.includes("CollapsedListFilters")) {
  fail("FixedAssetsPage must not use CollapsedListFilters (443.293-C V3)");
}
if (!fixedAssetsPage.includes('data-fixed-assets-filter-toolbar="visible"')) {
  fail("FixedAssetsPage filter bar must use data-fixed-assets-filter-toolbar=visible");
}

console.log("PASS: verify-acct-receipts-leaf");
