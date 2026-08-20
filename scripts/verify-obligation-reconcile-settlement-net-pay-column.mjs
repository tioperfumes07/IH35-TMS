#!/usr/bin/env node
/**
 * ACCT-F5607 regression guard — obligation-reconcile.routes.ts's settlement-obligation query must
 * select the REAL column (driver_finance.driver_settlements.net_pay) and convert it from dollars to
 * cents, never the phantom `net_settlement_cents` (which never existed) treated as an already-cents
 * value.
 *
 * WHY THIS MATTERS: the query runs inside withSavepoint(), whose catch-all swallows ANY error
 * (including 42703 undefined_column) and returns `{ rows: [] }`. A regression back to the phantom
 * column name does not surface as a visible error anywhere -- it silently makes the obligation-
 * reconcile screen show ZERO settlement obligations again, indistinguishable from "nothing to
 * reconcile," exactly the bug this finding fixed. A regression to the RIGHT column name but the WRONG
 * unit conversion (treating net_pay's dollar value as already-cents) is just as dangerous in the
 * other direction -- it would silently understate every settlement obligation by ~100x while still
 * "working" (no error, plausible-looking small numbers).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-obligation-reconcile-settlement-net-pay-column";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/banking/obligation-reconcile.routes.ts";

const SELECT_LINE = "SELECT id, net_pay, created_at::text";
const CONVERT_LINE = "amount_cents: Math.abs(Math.round(Number(r.net_pay ?? 0) * 100)),";

function assertAll(src) {
  const problems = [];
  if (!src.includes(SELECT_LINE)) {
    problems.push(
      `settlement query does not select the real net_pay column ("${SELECT_LINE}") -- either ` +
        `reverted to the phantom net_settlement_cents (silently swallowed by withSavepoint, screen ` +
        `shows 0 settlement obligations) or drifted to yet another column name.`
    );
  }
  if (!src.includes(CONVERT_LINE)) {
    problems.push(
      `settlement amount_cents conversion does not multiply net_pay (dollars) by 100 -- net_pay is ` +
        `a numeric DOLLARS column (confirmed live), so treating it as already-cents understates every ` +
        `settlement obligation by ~100x.`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const revertedColumn = src.replace(SELECT_LINE, "SELECT id, net_settlement_cents, created_at::text");
  const revertedProblems = assertAll(revertedColumn);
  if (!revertedProblems.some((p) => p.includes("phantom"))) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the phantom column not caught`);
    process.exit(1);
  }

  const droppedConversion = src.replace(CONVERT_LINE, "amount_cents: Math.abs(Math.round(Number(r.net_pay ?? 0))),");
  const droppedProblems = assertAll(droppedConversion);
  if (!droppedProblems.some((p) => p.includes("100x"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the *100 dollars-to-cents conversion not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — settlement obligation query selects real net_pay and converts dollars to cents`);
