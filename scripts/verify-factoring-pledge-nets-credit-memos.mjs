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
if (!src.includes("credit_memo_applications")) fail("factoring routes must join credit_memo_applications");
if (!src.includes("FACT-PLEDGE-NET-CM")) fail("missing FACT-PLEDGE-NET-CM marker");
if (!src.includes("pledge_cents")) fail("missing pledge_cents");
if (/invoiceRes\.rows\.reduce\(\s*\(sum[^)]*total_cents/.test(src)) {
  fail("create still sums total_cents instead of pledge_cents");
}

if (process.argv.includes("--selftest")) {
  const planted = src.replace("credit_memo_applications", "NOPE_APPLICATIONS");
  if (planted.includes("credit_memo_applications")) fail("selftest plant did not remove join");
}

console.log("PASS: factoring pledge nets credit memos");
process.exit(0);
