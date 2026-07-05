#!/usr/bin/env node
/**
 * Static CI guard — MOR / UST Form 425C court cash lines (REPAIR-MOR-CASH-LINES-AND-PHANTOM-COLUMNS).
 *
 * The Chapter 11 Monthly Operating Report cash lines (19–23) and Exhibits A–D were written against a
 * bank schema that does not exist in db/migrations/, and every query swallowed the resulting error to
 * zeros — silently filing $0 receipts/disbursements to a bankruptcy court. This guard FAILS the build
 * if any of those phantom identifiers reappears, if a zero-returning `.catch(() => …)` re-wraps a cash
 * query, or if the is_credit direction grouping is lost (which would let a naive sign test swap
 * receipts and disbursements on the filing).
 *
 * Comments are stripped before scanning so the intentional documentation of the fix does not trip it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const TARGETS = [
  "apps/backend/src/compliance/form-425c.routes.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-a-cash-receipts.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-b-disbursements.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts",
  "apps/backend/src/reports/form-425c/exhibits/exhibit-d-quarterly-fees.ts",
];

// Phantom identifiers that must never reappear in the cash query code (see spec Appendix).
const PHANTOMS = [
  { re: /bt\.amount(?!_cents)/, label: "bt.amount (real: bt.amount_cents)" },
  { re: /bt\.account_id/, label: "bt.account_id (real: bt.bank_account_id)" },
  { re: /bt\.txn_date/, label: "bt.txn_date (real: bt.transaction_date)" },
  { re: /bt\.counterparty_name/, label: "bt.counterparty_name (real: bt.merchant_name)" },
  { re: /\ba\.is_dip\b/, label: "a.is_dip (no such column)" },
  { re: /\ba\.tag\b/, label: "a.tag (no such column)" },
  { re: /\ba\.name\b/, label: "a.name (real: a.account_name)" },
  { re: /\ba\.mask\b/, label: "a.mask (real: a.account_mask)" },
  { re: /bank_account_balances/, label: "banking.bank_account_balances (no such table)" },
];

// Files whose cash query MUST group on is_credit (never the amount sign).
const IS_CREDIT_REQUIRED = TARGETS;

/** Strip block and line comments so the guard scans only executable code + SQL. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1); // keep the char before // (avoid eating "https://" etc.)
}

const failures = [];

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}:1 target file missing`);
    continue;
  }
  const raw = fs.readFileSync(abs, "utf8");
  const code = stripComments(raw);

  for (const { re, label } of PHANTOMS) {
    if (re.test(code)) failures.push(`${rel}: phantom identifier present -> ${label}`);
  }

  // Zero-swallow: a no-arg .catch(() => …) around a cash query re-hides errors on a court filing.
  if (/\.catch\(\s*\(\s*\)\s*=>/.test(code)) {
    failures.push(`${rel}: found a zero-swallow ".catch(() => …)" — cash queries must FAIL LOUD`);
  }

  if (IS_CREDIT_REQUIRED.includes(rel) && !/is_credit/.test(code)) {
    failures.push(`${rel}: cash query must GROUP ON is_credit (direction flag), never the amount sign`);
  }
}

if (failures.length) {
  console.error("verify:mor-cash-no-phantom-columns — FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("verify:mor-cash-no-phantom-columns — OK (no phantom columns, no zero-swallow, is_credit grouping present)");
