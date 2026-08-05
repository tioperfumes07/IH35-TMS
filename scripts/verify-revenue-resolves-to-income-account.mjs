#!/usr/bin/env node
/**
 * GUARD — verify-revenue-resolves-to-income-account
 *
 * THE DEFECT THIS ASSERTS — found by walking a load end-to-end, not by reading code
 * The invoice poster resolves a line's revenue account from
 * `catalogs.items.default_income_account_id`. That column is NOT type-constrained, and on prod at
 * least one TRANSP item — "Driver Deduction-Escrow for Claims" — points it at a **LIABILITY**
 * (`QBO-1150040174 2026-Damage Claim Escrow`).
 *
 * For a driver DEDUCTION that credit is correct: escrow is money held in trust, a liability, per the
 * locked decision. The danger is that this is the INVOICE revenue resolver. If that item ever appears
 * on a customer invoice, the poster would credit a liability as revenue — income understated,
 * liabilities overstated, the entry still balanced, and nothing raised. A balanced wrong entry is the
 * hardest kind to find, because every arithmetic check passes.
 *
 * The fix restricts the join to Income/Revenue/OtherIncome, so a mis-typed mapping makes the account
 * UNRESOLVABLE and routes to the existing fail-closed error naming the offending line — a refusal a
 * human can act on, instead of a silent misclassification.
 *
 * WHAT IS ASSERTED
 *   1. the item→income join constrains account_type to income kinds;
 *   2. the "no default account" refusal survives — the poster must never fall back to a catch-all
 *      revenue account when resolution fails (that would re-open the same hole from the other side);
 *   3. the load-revenue source_load_id fail-closed check survives alongside it.
 *
 * METHOD: comments and strings stripped before structural assertions. --selftest mutates the REAL
 * source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-revenue-resolves-to-income-account";
const SVC = "apps/backend/src/accounting/posting-engine.service.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function check(raw) {
  const errors = [];
  const src = stripComments(raw ?? "");
  if (!src) {
    errors.push(`${SVC}: missing`);
    return errors;
  }

  // 1. The item→income join must be type-constrained.
  // Match the constraint on the itm alias directly. An earlier version anchored on the LEFT JOIN and
  // scanned a fixed 600-char window, which the explanatory SQL comment pushed the clause outside of —
  // the guard then failed on correct source, which is how guards get muted.
  const joinRe = /\bitm\.account_type\s+IN\s*\(([^)]*)\)/i;
  const m = src.match(joinRe);
  if (!m) {
    errors.push(
      `${SVC}: the item→revenue join does not constrain itm.account_type. catalogs.items.` +
        `default_income_account_id is not type-constrained, and a prod item points it at a LIABILITY — ` +
        `an invoice line on that item would credit a liability as revenue, balanced and silent.`
    );
  } else if (!/Income/i.test(m[1])) {
    errors.push(`${SVC}: the item→revenue account_type constraint does not include Income: ${m[1]}`);
  }

  // 2. No silent default revenue account.
  if (!/invoice_line_revenue_account_unresolved/.test(src)) {
    errors.push(
      `${SVC}: the unresolved-revenue refusal is gone. Falling back to a default revenue account would ` +
        `re-open the same hole from the other side — every mis-mapped line would post silently.`
    );
  }

  // 3. Load-revenue still fails closed without its source load.
  if (!/assertLoadRevenueHasSourceLoad\s*\(/.test(src)) {
    errors.push(`${SVC}: assertLoadRevenueHasSourceLoad is no longer called — load revenue could post with no load.`);
  }
  return errors;
}

function selftest() {
  const real = readFileSync(SVC, "utf8");
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    [
      "type constraint removed from the item→revenue join",
      (s) => s.replace("AND itm.account_type IN ('Income', 'Revenue', 'OtherIncome')", ""),
    ],
    [
      "constraint no longer includes Income",
      (s) => s.replace("AND itm.account_type IN ('Income', 'Revenue', 'OtherIncome')", "AND itm.account_type IN ('Expense')"),
    ],
    ["unresolved-revenue refusal removed", (s) => s.split("invoice_line_revenue_account_unresolved").join("ok_default")],
    ["load-revenue source check removed", (s) => s.split("assertLoadRevenueHasSourceLoad(").join("noopCheck(")],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

let src = "";
try {
  src = readFileSync(SVC, "utf8");
} catch {
  src = "";
}
const errors = check(src);
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in revenue account resolution:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — invoice revenue can only credit an income-typed account; a mis-typed item mapping ` +
    `fails closed by name instead of posting a balanced but wrong entry.`
);
