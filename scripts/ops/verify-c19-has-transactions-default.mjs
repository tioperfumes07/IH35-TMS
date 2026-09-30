#!/usr/bin/env node
/**
 * C-19 / C-31 — Customers/Vendors default roster = has_transactions via A-21 shared predicate.
 * Superseded UI shape: With transactions is the DEFAULT NAVY TAB (not a buried SegmentedControl).
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

for (const [rel, label] of [
  ["apps/frontend/src/pages/Customers.tsx", "Customers"],
  ["apps/frontend/src/pages/Vendors.tsx", "Vendors"],
]) {
  const src = read(rel);
  if (!src.includes("has_transactions: true")) {
    fail(`${label}: list query must pass has_transactions:true for the With transactions tab`);
  }
  if (!src.includes("With transactions")) {
    fail(`${label}: With transactions must appear as a visible tab label`);
  }
  if (!src.includes("with_transactions") && !src.includes('data-c31-list-default')) {
    fail(`${label}: default tab must be with_transactions (C-31)`);
  }
  if (/filter\(\([^)]*\)\s*=>\s*[^)]*has_?txn|hasTransaction/i.test(src) && !src.includes("has_transactions: true")) {
    fail(`${label}: must use server has_transactions, not a client-side invent`);
  }
  ok(`C-19/C-31 ${label} defaults With transactions via A-21`);
}

console.log("verify-c19-has-transactions-default --selftest OK");
