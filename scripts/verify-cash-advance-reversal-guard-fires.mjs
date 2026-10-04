#!/usr/bin/env node
/**
 * verify-cash-advance-reversal-guard-fires.mjs
 *
 * CASH-ADV-F9930-REVERSE-GUARD-NEVER-BLOCKS (filed 2026-08-28, fixed 2026-09-03). The reversal
 * route's settlement-usage guard used to query settlement_lines.liability_id, a column that has
 * never existed, wrapped in a .catch that swallowed the error to rows=[] — cnt was always 0, so
 * the guard never blocked a reversal after settlement deductions, at any point, ever.
 */
import { readFileSync } from "node:fs";

const ROUTE_PATH = "apps/backend/src/cash-advances/cash-advances.routes.ts";

function loadSource() {
  return readFileSync(ROUTE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (/FROM driver_finance\.settlement_lines\s*\n\s*WHERE liability_id/.test(src)) {
    failures.push("reversal guard still queries the nonexistent settlement_lines.liability_id column");
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\{ cnt: 0 \}\]/.test(src)) {
    failures.push("reversal guard still swallows the query error to a hardcoded cnt:0");
  }
  // ROUND 394 RULING 1 — "recovered" is read from the GL (driver_finance.v_driver_advance_balances.recovered_cents),
  // not the liability's stored paid_to_date.
  if (!/FROM driver_finance\.v_driver_advance_balances/.test(src) || !/recovered_cents/.test(src)) {
    failures.push("reversal guard does not read the GL-derived recovered_cents (driver_finance.v_driver_advance_balances)");
  }
  if (!/Number\(recoveredRes\.rows\[0\]\?\.recovered_cents \?\? 0\) > 0/.test(src)) {
    failures.push("reversal guard does not block when the advance has any recovery on the GL");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-cash-advance-reversal-guard-fires SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    [
      "block condition removed",
      "if (Number(recoveredRes.rows[0]?.recovered_cents ?? 0) > 0) {",
      "if (false) {",
    ],
    [
      "reverted to the broken settlement_lines query",
      "SELECT recovered_cents::text\n          FROM driver_finance.v_driver_advance_balances",
      "SELECT COUNT(*)::int AS cnt\n          FROM driver_finance.settlement_lines\n          WHERE liability_id",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-cash-advance-reversal-guard-fires SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-cash-advance-reversal-guard-fires SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-cash-advance-reversal-guard-fires: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-advance-reversal-guard-fires: OK — a cash advance with any recovery on the GL (v_driver_advance_balances.recovered_cents) cannot be reversed");
