#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
function fail(m) { console.error(`verify:cc-payment-posts-to-qbo FAIL: ${m}`); process.exit(1); }
// orphan-triage F1: BillPaymentPage.tsx was a verified-dead, zero-route duplicate of the live
// BillPaymentsListPage.tsx (registered at /accounting/bill-payments). Its one distinct feature —
// the "Pay with CC" action (CCPaymentModal) — was ported into BillPaymentsListPage.tsx and the
// redundant shell page was deleted; check the real mounted page instead.
for (const rel of [
  "apps/backend/src/bill-payments/cc-payment.routes.ts",
  "apps/backend/src/bill-payments/qbo-cc-payment-poster.ts",
  "db/migrations/0391_cc_payments.sql",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
]) if (!fs.existsSync(path.join(root, rel))) fail(`missing ${rel}`);
const routes = fs.readFileSync(path.join(root, "apps/backend/src/bill-payments/cc-payment.routes.ts"), "utf8");
const poster = fs.readFileSync(path.join(root, "apps/backend/src/bill-payments/qbo-cc-payment-poster.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx"), "utf8");
if (!routes.includes('"/api/v1/bill-payments/cc"')) fail("route missing");
if (!poster.includes("PayType")) fail("poster missing PayType");
if (!page.includes("Pay with CC")) fail("UI missing Pay with CC");
console.log("verify:cc-payment-posts-to-qbo PASS");
