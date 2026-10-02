#!/usr/bin/env node
/**
 * FACT-PLEDGE-NET-CM — factoring submit must net credit memos the same way A/R aging does.
 * Fails closed if routes still SUM invoices.total_cents without credit_memo_applications.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "apps/backend/src/accounting/factoring-advances.routes.ts"), "utf8");

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

if (!src.includes("INVOICE_PLEDGE_CENTS_SQL")) fail("missing INVOICE_PLEDGE_CENTS_SQL");
// FACT-DELIVERED-AUTO moved INVOICE_PLEDGE_CENTS_SQL into accounting/shared.js (one definition); the routes import it.
// The credit-memo netting must live in that one definition.
const shared = readFileSync(join(root, "apps/backend/src/accounting/shared.ts"), "utf8");
const pledgeDef = shared.slice(shared.indexOf("export const INVOICE_PLEDGE_CENTS_SQL"));
const nettingSrc = src.includes("credit_memo_applications") ? src : pledgeDef.slice(0, pledgeDef.indexOf("`;") + 2);
if (!/INVOICE_PLEDGE_CENTS_SQL[^\n]*from "\.\/shared\.js"/.test(src) && !src.includes("credit_memo_applications")) {
  fail("factoring routes must use the shared INVOICE_PLEDGE_CENTS_SQL (or join credit_memo_applications themselves)");
}
if (!nettingSrc.includes("credit_memo_applications")) fail("the pledge definition must net credit_memo_applications");
if (!src.includes("FACT-PLEDGE-NET-CM")) fail("missing FACT-PLEDGE-NET-CM marker");
if (!src.includes("pledge_cents")) fail("missing pledge_cents");

const cm = readFileSync(join(root, "apps/backend/src/accounting/credit-memos.routes.ts"), "utf8");
for (const code of [
  "billing_error_ours",
  "penalty_assessed",
  "agreed_concession",
  "quick_pay_discount",
  "unauthorized_deduction",
]) {
  if (!cm.includes(`"${code}"`)) fail(`credit-memos.routes missing reason ${code}`);
}
const mig = readFileSync(
  join(root, "db/migrations/202613301600_shortpay_accountability_close_the_gaps.sql"),
  "utf8",
);
for (const acct of ["4955", "4970", "4980", "1240"]) {
  if (!mig.includes(`'${acct}'`)) fail(`accountability migration missing account ${acct}`);
}
if (/invoiceRes\.rows\.reduce\(\s*\(sum[^)]*total_cents/.test(src)) {
  fail("create still sums total_cents instead of pledge_cents");
}

if (process.argv.includes("--selftest")) {
  // Plant: strip the netting from the one pledge definition; the netting check must then fail.
  const planted = pledgeDef.replace(/credit_memo_applications/g, "NOPE_APPLICATIONS");
  if (planted.includes("credit_memo_applications")) fail("selftest plant did not remove join");
  const plantedNetting = planted.slice(0, planted.indexOf("`;") + 2);
  if (plantedNetting.includes("credit_memo_applications")) fail("selftest: a pledge definition without netting was not caught");
  console.log("selftest PASS: a pledge definition without credit-memo netting is caught");
}

console.log("PASS: factoring pledge nets credit memos");
process.exit(0);
