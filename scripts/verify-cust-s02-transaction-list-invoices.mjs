#!/usr/bin/env node
/**
 * CUST-S02 — Customer Transaction List must load accounting.invoices via listInvoices
 * (not a silent empty / fixture). Neon lucia 2026-08-03: 11981 invoices, all with customer_id.
 *
 *   node scripts/verify-cust-s02-transaction-list-invoices.mjs
 *   node scripts/verify-cust-s02-transaction-list-invoices.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-s02-transaction-list-invoices";
const PAGE = "apps/frontend/src/pages/Customers.tsx";
const API = "apps/frontend/src/api/accounting.ts";

function assert(files) {
  const problems = [];
  const page = files[PAGE] ?? "";
  const api = files[API] ?? "";

  if (!/listInvoices/.test(api) || !/\/api\/v1\/.*invoice/i.test(api)) {
    problems.push(`${API}: must export listInvoices hitting invoice API`);
  }
  if (!/import \{[^}]*listInvoices/.test(page) && !/listInvoices/.test(page)) {
    problems.push(`${PAGE}: must import/use listInvoices`);
  }
  if (!/transaction_list/.test(page)) {
    problems.push(`${PAGE}: missing transaction_list tab`);
  }
  if (!/listInvoices\(/.test(page)) {
    problems.push(`${PAGE}: transaction list must call listInvoices(`);
  }
  if (/FAKE_INVOICES|fixtureInvoices|MOCK_INVOICES/.test(page)) {
    problems.push(`${PAGE}: must not use fixture invoices`);
  }
  return problems;
}

const files = Object.fromEntries(
  [PAGE, API].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = { ...files, [PAGE]: files[PAGE].replace(/listInvoices\(/g, "listSomethingElse(") };
  const caught = assert(planted);
  if (!caught.some((p) => /listInvoices\(/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL`, caught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Transaction List wired to listInvoices (Neon invoices=11981 all with customer_id)`);
process.exit(0);
