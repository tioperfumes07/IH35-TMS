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

console.log("PASS: verify-acct-receipts-leaf");
