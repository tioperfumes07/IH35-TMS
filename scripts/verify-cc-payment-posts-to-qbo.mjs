#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
function fail(m) { console.error(`verify:cc-payment-posts-to-qbo FAIL: ${m}`); process.exit(1); }
// orphan-triage F1: BillPaymentPage.tsx was a verified-dead, zero-route duplicate of the live
// BillPaymentsListPage.tsx (registered at /accounting/bill-payments). Its one distinct feature —
// the "Pay with CC" action (CCPaymentModal) — was ported into BillPaymentsListPage.tsx and the
// redundant shell page was deleted; check the real mounted page instead.
//
// ACCT-F4431381 (Lead 443.137 item 9e, part 2):
//   OLD: required apps/backend/src/bill-payments/qbo-cc-payment-poster.ts to EXIST and to build a QuickBooks
//        CreditCard BillPayment payload (PayType).
//   NEW: requires that file to be ABSENT, and requires no backend source to build a QuickBooks CreditCard
//        BillPayment payload (PayType: "CreditCard") or import the poster module.
//   WHY: QuickBooks is a read-only archive; the CC payment route writes the native payment + GL only (part 1,
//        PR #26728). The poster had zero runtime callers (only its own unit test), so the only thing it could
//        do was be re-wired into a QuickBooks push. Its absence is the stricter assertion, not a looser one.
const POSTER = "apps/backend/src/bill-payments/qbo-cc-payment-poster.ts";
for (const rel of [
  "apps/backend/src/bill-payments/cc-payment.routes.ts",
  "db/migrations/0391_cc_payments.sql",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
]) if (!fs.existsSync(path.join(root, rel))) fail(`missing ${rel}`);
if (fs.existsSync(path.join(root, POSTER))) fail(`${POSTER} must be ABSENT — QuickBooks is a read-only archive (443.137 9e); the CC payment never builds a QBO payload`);
function walkTs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walkTs(p, out); }
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const abs of walkTs(path.join(root, "apps/backend/src"))) {
  const src = fs.readFileSync(abs, "utf8");
  if (/qbo-cc-payment-poster(\.js)?["']/.test(src)) fail(`${path.relative(root, abs)} imports the removed QBO CC payment poster`);
  if (/PayType\s*:\s*["']CreditCard["']/.test(src)) fail(`${path.relative(root, abs)} builds a QuickBooks CreditCard BillPayment payload (PayType: "CreditCard")`);
}
const routes = fs.readFileSync(path.join(root, "apps/backend/src/bill-payments/cc-payment.routes.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx"), "utf8");
if (!routes.includes('"/api/v1/bill-payments/cc"')) fail("route missing");
if (!page.includes("Pay with CC")) fail("UI missing Pay with CC");
console.log("verify:cc-payment-posts-to-qbo PASS (native CC payment route + UI present; QBO CC poster absent, no CreditCard BillPayment payload built)");
