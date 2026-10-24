#!/usr/bin/env node
/**
 * ENG-02 (443.322) — load-profitability.service.ts must use driver_bills.gross_amount_cents
 * for driver_pay_cents, not the accrual (sl.amount * 100).
 *
 * ROOT CAUSE: settlement_lines CTE read sl.amount * 100 (accrued settlement-line amount)
 * instead of driver_bills.gross_amount_cents. Load 13574 showed $1,538.81 (accrued) vs
 * $957.55 (gross). The CASE fallback to sl.amount*100 is retained for lines without a bill,
 * so its presence alone is not a violation — only an unconditional ROUND(sl.amount * 100)
 * in the earnings filter is the old pattern.
 *
 * Guard: two static checks on load-profitability.service.ts
 *   MUST contain: db.gross_amount_cents (reads bill gross)
 *   MUST NOT contain: an unconditional ROUND(sl.amount * 100) filtered on earnings line_types
 *
 * Usage: node scripts/verify-load-driver-pay-equals-driver-bill-gross.mjs [--selftest]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const LABEL = "verify-load-driver-pay-equals-driver-bill-gross";
const TARGET = "apps/backend/src/dispatch/load-profitability.service.ts";

// The old pattern: earnings filter applied directly to ROUND(sl.amount * 100)
// This is a substring that appears in the broken CTE but not in the fixed one.
const FORBIDDEN_PATTERN =
  "ROUND(sl.amount * 100)) FILTER (\n          WHERE sl.line_type IN ('earnings'";

// The required pattern: the fix JOINs driver_bills and reads gross_amount_cents
const REQUIRED_PATTERN = "db.gross_amount_cents";

export function checkContent(content) {
  const hasForbidden = content.includes(FORBIDDEN_PATTERN);
  const hasRequired = content.includes(REQUIRED_PATTERN);
  return { hasForbidden, hasRequired };
}

if (process.argv.includes("--selftest")) {
  const good = `CASE WHEN sl.line_type IN ('earnings') AND db.id IS NOT NULL THEN db.gross_amount_cents ELSE ROUND(sl.amount * 100)::bigint END`;
  const bad = `COALESCE(SUM(ROUND(sl.amount * 100)) FILTER (\n          WHERE sl.line_type IN ('earnings', 'team_split_primary', 'team_split_secondary')\n        ), 0)::bigint AS driver_pay_cents`;

  const cases = [
    ["good: has gross_amount_cents, no forbidden pattern",
      (() => { const r = checkContent(good); return !r.hasForbidden && r.hasRequired; })()],
    ["bad: has forbidden pattern, no gross_amount_cents",
      (() => { const r = checkContent(bad); return r.hasForbidden && !r.hasRequired; })()],
    ["mixed: both present = forbidden still set",
      (() => { const r = checkContent(good + "\n" + bad); return r.hasForbidden; })()],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad2 = cases.filter(([, p]) => !p).length;
  console.log(bad2 ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad2 ? 1 : 0);
}

const root = process.env.REPO_ROOT ?? resolve(import.meta.dirname, "..");
const filePath = resolve(root, TARGET);

let content;
try {
  content = readFileSync(filePath, "utf8");
} catch (err) {
  console.error(`${LABEL}: ERROR — cannot read ${TARGET}: ${err.message}`);
  process.exit(1);
}

const { hasForbidden, hasRequired } = checkContent(content);
const failures = [];

if (hasForbidden) {
  failures.push(
    `${TARGET} contains the old accrual-reader pattern for driver_pay_cents — must use driver_bills.gross_amount_cents instead`
  );
}
if (!hasRequired) {
  failures.push(
    `${TARGET} does not contain 'db.gross_amount_cents' — settlement_lines CTE must JOIN driver_bills and read gross amount`
  );
}

if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`${LABEL}: PASS — ${TARGET} uses driver_bills.gross_amount_cents for driver_pay_cents`);
process.exit(0);
