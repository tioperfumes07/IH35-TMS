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

// 443.182-A (52699c6c2f, #26871) moved listCustomers / listVendors and their CompanyScopedListParams +
// appendCompanyScopedQuery verbatim out of mdata.ts into the one-source catalog clients (mdata.ts only
// re-exports them). Each catalog client now owns its own query builder, so EACH must forward the flag.
const CLIENTS = ["apps/frontend/src/api/catalog-customers.ts", "apps/frontend/src/api/catalog-vendors.ts"];
// #26976 (heavy CI peel 118) moved the shared params + query builder into api/mdata-list.ts, which both catalog clients
// import — a client that imports it is audited together with that shared module.
const SHARED = "apps/frontend/src/api/mdata-list.ts";
function auditClient(rel, clientSrc, sharedSrc = read(SHARED)) {
  const out = [];
  const src = /from "\.\/mdata-list"/.test(clientSrc) ? `${clientSrc}\n${sharedSrc}` : clientSrc;
  if (!src.includes("has_transactions?: boolean")) out.push(`${rel} missing has_transactions on CompanyScopedListParams`);
  if (!src.includes('query.set("has_transactions", "true")')) out.push(`${rel} must forward has_transactions query param`);
  return out;
}
for (const rel of CLIENTS) {
  const src = read(rel);
  const problems = auditClient(rel, src);
  if (problems.length) fail(problems.join("; "));
  // Planted regression: a client (or the shared module it imports) that stops forwarding the flag must be rejected.
  const shared = read(SHARED);
  const plantedClient = src.replace('query.set("has_transactions", "true")', "void 0");
  const plantedShared = shared.replace('query.set("has_transactions", "true")', "void 0");
  const caught = plantedClient !== src ? auditClient(rel, plantedClient, shared).length > 0 : plantedShared !== shared && auditClient(rel, src, plantedShared).length > 0;
  if (!caught) fail(`selftest: dropped has_transactions forward in ${rel} NOT detected`);
}
ok("C-19 API clients (customers + vendors catalogs) forward has_transactions");

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
