#!/usr/bin/env node
/**
 * C-19 — Customers/Vendors default roster = has_transactions via A-21 shared predicate.
 * Full list stays behind explicit "All …" control (?txn=all). Never a client-side filter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c19-has-transactions-default.mjs --selftest");
  process.exit(0);
}

const api = read("apps/frontend/src/api/mdata.ts");
if (!api.includes("has_transactions?: boolean")) fail("mdata.ts missing has_transactions on CompanyScopedListParams");
if (!api.includes('query.set("has_transactions", "true")')) fail("mdata.ts must forward has_transactions query param");
ok("C-19 API client forwards has_transactions");

for (const [rel, label, allLabel] of [
  ["apps/frontend/src/pages/Customers.tsx", "Customers", "All customers"],
  ["apps/frontend/src/pages/Vendors.tsx", "Vendors", "All vendors"],
]) {
  const src = read(rel);
  if (!src.includes('searchParams.get("txn") ?? "with"')) fail(`${label}: txnScope must default to with`);
  if (!/txnScope === "with" \? \{ has_transactions: true \}/.test(src)) {
    fail(`${label}: list query must pass has_transactions:true when txnScope=with`);
  }
  if (!src.includes('data-c19-txn-scope')) fail(`${label}: missing data-c19-txn-scope marker`);
  if (!src.includes('label: "With transactions"')) fail(`${label}: missing With transactions control`);
  if (!src.includes(`label: "${allLabel}"`)) fail(`${label}: missing ${allLabel} control`);
  // Must not invent a local client-side filter substituting for the server predicate.
  if (/filter\(\([^)]*\)\s*=>\s*[^)]*has_?txn|hasTransaction/i.test(src) && !src.includes("has_transactions: true")) {
    fail(`${label}: must use server has_transactions, not a client-side invent`);
  }
  ok(`C-19 ${label} defaults With transactions via A-21`);
}

console.log("verify-c19-has-transactions-default --selftest OK");
