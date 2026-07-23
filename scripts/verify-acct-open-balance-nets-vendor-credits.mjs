#!/usr/bin/env node
/**
 * Rule-17 guard: open balance must net off vendor credits, and a credit application must not
 * exceed the bill's remaining balance.
 *
 * WHY THIS EXISTS
 * Two independent definitions of "open balance" were live at the same time:
 *   A/P aging (ap-aging.service.ts) = amount_cents - SUM(bill_payments) - SUM(vendor_credit_applications)
 *   bills list + Pay-Bill picker      = amount_cents - paid_cents
 * and vendor-credits.routes.ts never updates bills.paid_cents. So a bill fully settled by a vendor
 * credit showed $0 in the aging while still listing as open AND still being selectable in the pay
 * picker — an operator could pay a bill a credit had already settled.
 *
 * Fixed on the READ side deliberately: bills.paid_cents has four independent writers, one of which
 * recomputes MAX(0, paid - amount) on void. Folding credits into that column would corrupt it.
 *
 * Separately, the apply route SELECTed bill.amount_cents / bill.paid_cents and then never used
 * them, so the only ceiling was the credit's own unapplied amount — a $5,000 credit could be
 * applied to a $100 bill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-open-balance-nets-vendor-credits";
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const CREDITS = "apps/backend/src/accounting/vendor-credits.routes.ts";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function check({ bills, credits }) {
  const errors = [];

  // --- open balance nets credits -------------------------------------------------------------
  if (!/vendor_credit_applications/.test(bills)) {
    errors.push(`${BILLS}: open-balance SQL must subtract accounting.vendor_credit_applications, or a credit-settled bill stays payable`);
  }
  if (!/voided_at IS NULL/.test(bills)) {
    errors.push(`${BILLS}: applied-credit subquery must exclude voided applications (voided_at IS NULL)`);
  }
  // The bare two-term form must not come back anywhere.
  if (/COALESCE\(b\.amount_cents,\s*0\)\s*-\s*COALESCE\(b\.paid_cents,\s*0\)\)\s*>\s*0/.test(bills)) {
    errors.push(`${BILLS}: found the old two-term open-balance filter (amount - paid only) — it must also net applied vendor credits`);
  }
  // Both hasBalance call sites must use the shared constant, so they cannot drift apart again.
  const usages = (bills.match(/BILL_OPEN_BALANCE_SQL/g) || []).length;
  if (usages < 3) {
    errors.push(`${BILLS}: both hasBalance filters must use the shared BILL_OPEN_BALANCE_SQL constant (found ${usages} references, expected the definition + 2 uses)`);
  }

  // --- apply cap ------------------------------------------------------------------------------
  if (!/applied_cents_exceeds_bill_balance/.test(credits)) {
    errors.push(`${CREDITS}: applying a credit must reject applied_cents greater than the bill's remaining balance`);
  }
  // The cap must net off credits already applied to that bill, else two half applications overshoot.
  const capRegion = credits.slice(0, credits.indexOf("applied_cents_exceeds_bill_balance"));
  if (!/SUM\(applied_cents\)/.test(capRegion)) {
    errors.push(`${CREDITS}: the remaining-balance cap must subtract credits ALREADY applied to the bill (SUM(applied_cents)), or two partial applications can still overshoot`);
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = { bills: read(BILLS), credits: read(CREDITS) };

  const liveErrors = check(live);
  if (liveErrors.length) problems.push(`live sources rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["credits no longer subtracted", { ...live, bills: live.bills.replace(/vendor_credit_applications/g, "some_other_table") }, "must subtract accounting.vendor_credit_applications"],
    ["voided applications counted again", { ...live, bills: live.bills.replace(/voided_at IS NULL/g, "") }, "must exclude voided applications"],
    ["a hasBalance site drifts back to the two-term form", { ...live, bills: live.bills.replace(/BILL_OPEN_BALANCE_SQL/g, "X") }, "shared BILL_OPEN_BALANCE_SQL"],
    ["apply cap removed", { ...live, credits: live.credits.replace(/applied_cents_exceeds_bill_balance/g, "something_else") }, "greater than the bill's remaining balance"],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated.bills === live.bills && mutated.credits === live.credits) {
      problems.push(`planted regression "${name}" did not mutate the source — selftest is inert`);
      continue;
    }
    const found = check(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live sources clean; ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check({ bills: read(BILLS), credits: read(CREDITS) });
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
