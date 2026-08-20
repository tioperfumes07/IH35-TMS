#!/usr/bin/env node
/**
 * ACCT-F5609 regression guard — relay-wallet-balance-control.service.ts's "drawn" query must select
 * the REAL column (fuel.fuel_transactions.total_cost) and convert it from dollars to cents, never the
 * phantom `total_amount_cents` (which never existed on this table) treated as an already-cents value.
 *
 * WHY THIS MATTERS: this function computes `expected = funded - drawn` for the Relay fuel-card wallet
 * overdraft/fraud control (CONN-3). Neither this function nor its one caller
 * (relay-health.routes.ts) catches errors, so a reverted phantom-column reference is a genuine
 * unhandled 500 on GET /api/integrations/relay/wallet-balance-control -- not silent, but also not
 * caught by any test today (the endpoint has no frontend/cron caller), so nothing else would notice
 * a regression except this guard. A regression to the RIGHT column but the WRONG unit conversion
 * (treating total_cost's dollar value as already-cents) is just as dangerous the other direction --
 * it would silently understate "drawn" by ~100x, making the overdraft control far less sensitive
 * than intended without ever throwing an error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-wallet-balance-fuel-total-cost-column";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/integrations/relay-payments/relay-wallet-balance-control.service.ts";

const QUERY_LINE = "SELECT COALESCE(SUM(ABS(ROUND(total_cost * 100))), 0)::text AS drawn_cents";

function assertAll(src) {
  const problems = [];
  if (!src.includes(QUERY_LINE)) {
    problems.push(
      `"drawn" query does not select+convert the real total_cost column ("${QUERY_LINE}") -- either ` +
        `reverted to the phantom total_amount_cents (unhandled 500 on every call) or the dollars-to-` +
        `cents conversion was dropped (silently understates drawn by ~100x).`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const reverted = src.replace(
    QUERY_LINE,
    "SELECT COALESCE(SUM(ABS(total_amount_cents)), 0)::text AS drawn_cents"
  );
  const revertedProblems = assertAll(reverted);
  if (!revertedProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the phantom column not caught`);
    process.exit(1);
  }

  const droppedConversion = src.replace(
    QUERY_LINE,
    "SELECT COALESCE(SUM(ABS(total_cost)), 0)::text AS drawn_cents"
  );
  const droppedProblems = assertAll(droppedConversion);
  if (!droppedProblems.length) {
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
console.log(`${LABEL} OK — relay wallet drawn-balance query selects real total_cost and converts dollars to cents`);
