#!/usr/bin/env node
// INV-11 (ACC-18, board row, routed to CC-1): "/api/v1/admin/health/deep has ZERO financial
// checks" -- live-verified true (postgres/redis/R2/Plaid/QBO reachability only). Fixed by adding
// the SAME LEDGER_FINANCIAL_HEALTH_CHECKS array /api/v1/healthz already uses (A/R tie-out, A/P
// tie-out, unbalanced-JE, orphaned-bank-match, posted-without-posting, voided-without-reason) --
// reused verbatim, no new GL math. This guard asserts that wiring stays intact and that the
// financial checks are NOT hoisted into their own array ahead of the Promise.all literal (the
// exact ordering bug this build hit: hoisting raced a test's single-instance rejection mock onto
// the wrong check, since each timedProbe() call synchronously invokes its probe fn before awaiting).
import fs from "node:fs";

const LABEL = "verify-health-deep-financial-checks-wired";
const FILE = "apps/backend/src/admin/health-deep.service.ts";

export function checkFinancialChecksWired(src) {
  const errors = [];
  if (!/import\s*\{\s*LEDGER_FINANCIAL_HEALTH_CHECKS\s*\}\s*from\s*"\.\.\/health\/ledger-financial-health\.checks\.js"/.test(src)) {
    errors.push("LEDGER_FINANCIAL_HEALTH_CHECKS is no longer imported from ../health/ledger-financial-health.checks.js");
  }

  const fnMatch = src.match(/export async function runAdminDeepHealthProbe[\s\S]*?\n\}/);
  if (!fnMatch) {
    errors.push("runAdminDeepHealthProbe function not found");
    return errors;
  }
  const fnBody = fnMatch[0];

  if (!/LEDGER_FINANCIAL_HEALTH_CHECKS\.map\(/.test(fnBody)) {
    errors.push("runAdminDeepHealthProbe no longer maps over LEDGER_FINANCIAL_HEALTH_CHECKS");
  }

  // The map() call must be INLINE inside the Promise.all([...]) array literal, not hoisted into
  // its own variable declared before Promise.all -- hoisting reintroduces the call-order race.
  const promiseAllMatch = fnBody.match(/Promise\.all\(\[([\s\S]*?)\]\)/);
  if (!promiseAllMatch) {
    errors.push("no Promise.all([...]) call found in runAdminDeepHealthProbe");
  } else if (!/LEDGER_FINANCIAL_HEALTH_CHECKS\.map\(/.test(promiseAllMatch[1])) {
    errors.push(
      "LEDGER_FINANCIAL_HEALTH_CHECKS.map(...) is not inline inside the Promise.all([...]) array literal -- " +
        "a hoisted variable built before Promise.all starts those probes' withLuciaBypass calls before " +
        "postgres.select1's own, reopening the exact call-order race this build fixed"
    );
  }

  if (!/tier:\s*AdminDeepHealthCheck\["tier"\]/.test(src) && !/"critical"/.test(fnBody)) {
    errors.push("no critical-tier probe found in runAdminDeepHealthProbe");
  }

  return errors;
}

function check(src) {
  const errors = checkFinancialChecksWired(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace(
      'import { LEDGER_FINANCIAL_HEALTH_CHECKS } from "../health/ledger-financial-health.checks.js";',
      ""
    ),
    src.replace(
      "...LEDGER_FINANCIAL_HEALTH_CHECKS.map((c) => timedProbe(c.name, \"critical\", FINANCIAL_HEALTH_TIMEOUT_MS, c.run)),",
      ""
    ),
    // The exact regression this build hit: hoist the map() into its own variable before Promise.all.
    src
      .replace(
        "  const [postgres, redis, r2, plaid, qbo, ...financial] = await Promise.all([",
        "  const financialProbes = LEDGER_FINANCIAL_HEALTH_CHECKS.map((c) => timedProbe(c.name, \"critical\", FINANCIAL_HEALTH_TIMEOUT_MS, c.run));\n\n  const [postgres, redis, r2, plaid, qbo, ...financial] = await Promise.all(["
      )
      .replace(
        "...LEDGER_FINANCIAL_HEALTH_CHECKS.map((c) => timedProbe(c.name, \"critical\", FINANCIAL_HEALTH_TIMEOUT_MS, c.run)),",
        "...financialProbes,"
      ),
  ];
  for (const mutated of mutations) {
    if (mutated === src) throw new Error("a mutation was a no-op (pattern did not match source)");
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(src);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(src);
  console.log(
    `${LABEL} PASS -- /api/v1/admin/health/deep runs the same LEDGER_FINANCIAL_HEALTH_CHECKS /healthz uses, inline inside Promise.all (no call-order race)`
  );
}
