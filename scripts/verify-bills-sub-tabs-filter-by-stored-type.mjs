#!/usr/bin/env node
// U10 (owner, 2026-10-03) — every Bills sub-tab renders only its own type. Static.
//   1. the Bills list filters a category by the STORED type (bill.bill_category), never by memo / vendor words
//   2. migration 202615370700 adds bills.bill_category with the fact-derived BEFORE INSERT default
//   3. createBill applies the operator's chosen type; the bill form sends the type tab it shows
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";


if (process.argv.includes("--selftest")) selftest();

const LABEL = "verify-bills-sub-tabs-filter-by-stored-type";
const fails = [];
const page = readFileSync("apps/frontend/src/pages/accounting/BillsPage.tsx", "utf8");
const fn = page.slice(page.indexOf("function billMatchesCategory("), page.indexOf("function billBalanceCents("));
if (!/return bill\.bill_category === category;/.test(fn)) fails.push("BillsPage: billMatchesCategory no longer reads the stored bill_category");
if (/\.test\(hay\)|bill\.memo|vendor_name/.test(fn)) fails.push("BillsPage: a sub-tab guesses the bill type from memo / vendor words again");

const mig = readFileSync("db/migrations/202615370700_bills_bill_category.sql", "utf8");
for (const n of ["ADD COLUMN IF NOT EXISTS bill_category", "CREATE TRIGGER trg_bills_set_category", "v.driver_id IS NOT NULL", "code IN ('TRANSP', 'TRK')"]) {
  if (!mig.includes(n)) fails.push(`202615370700 lost "${n}"`);
}
const svc = readFileSync("apps/backend/src/accounting/bills.service.ts", "utf8");
if (!/if \(input\.billCategory && insertedId\)/.test(svc)) fails.push("createBill no longer applies the chosen bill_category");
const form = readFileSync("apps/frontend/src/components/accounting/VendorBillForm.tsx", "utf8");
if (!/bill_category: billType === "multiple" \? undefined/.test(form)) fails.push("VendorBillForm no longer sends the type tab it shows");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Bills sub-tabs filter by the stored bill_category (fact-derived default, operator choice wins); no memo-word guessing`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-bills-sub-tabs-filter-by-stored-type", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
