#!/usr/bin/env node
/**
 * F-18 / LV-BILLS-NULL-BILL-NUMBER — a bill with no document number must say so honestly.
 *
 * THE DEFECT: the Bill # column rendered `entityLabel(bill.bill_number, bill.id, "Bill")`, which falls
 * back to "Bill — not visible" when the number is null. That wording is correct for a record the caller
 * cannot see, and WRONG here: the operator is looking straight at the bill's row. Telling an A/P clerk a
 * bill is "not visible" while showing it to them is a false statement about their own data.
 *
 * NOT HYPOTHETICAL — prod-verified 2026-08-11 via psql as neondb_owner with a same-statement control
 * (accounting.bills = 16,294 visible): USMCA holds 47 bills and exactly ONE has bill_number IS NULL.
 *
 * WHAT IS ASSERTED: the Bill # column does not route a possibly-null bill_number through entityLabel's
 * not-visible fallback, and an explicit no-number label exists. The shared helper is intentionally out
 * of scope — its wording is right for the question it answers and other surfaces depend on it.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const LABEL = "verify-bills-list-null-number-honest";

export function audit(src) {
  const problems = [];
  if (/label=\{entityLabel\(bill\.bill_number, bill\.id, "Bill"\)\}/.test(src)) {
    problems.push(
      `${FILE}: the Bill # column routes bill_number through entityLabel, so a bill with no number renders ` +
        `"Bill — not visible" while the operator is looking at its row (F-18).`
    );
  }
  if (!/No bill #/.test(src)) {
    problems.push(`${FILE}: no explicit no-number label — a bill without a document number must say so.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.resolve(FILE), "utf8");
  const failures = [];
  if (audit(live).length) failures.push(`live source FAILS: ${audit(live).join(" | ")}`);
  const regressed = live.replace(
    /label=\{number !== "" \? number : "No bill #"\}/,
    'label={entityLabel(bill.bill_number, bill.id, "Bill")}'
  );
  if (regressed === live) failures.push("regression mutation INERT — the guard proves nothing");
  else if (!audit(regressed).some((p) => p.includes("not visible"))) failures.push("reverting to entityLabel was NOT caught");
  const stripped = live.replace(/No bill #/g, "x");
  if (stripped === live) failures.push("label mutation INERT");
  else if (!audit(stripped).some((p) => p.includes("no-number label"))) failures.push("removing the no-number label was NOT caught");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations caught, live source clean`);
  process.exit(0);
}

const abs = path.resolve(FILE);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${FILE} missing; scope wrong, refusing to pass vacuously.`);
  process.exit(1);
}
const problems = audit(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — a bill with no document number renders an honest no-number label.`);
process.exit(0);
