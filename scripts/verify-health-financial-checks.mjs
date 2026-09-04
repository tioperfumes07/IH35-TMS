/**
 * HEALTH-FINANCIAL-CHECKS-01 — ledger.* critical probes must be wired into deep healthz.
 * SEC-HEALTHZ: public body codes only (no dollar amounts in route source as response fields).
 *
 * ACC-18 (2026-09-03, COMPLETION LAW point 6): this guard existed but had no --selftest and was
 * never wired into scripts/verify-steps/ — the "written but never run" pattern this session found
 * repeatedly elsewhere (verify-load-costs-board-trailer-unit-columns, verify-bank-feed-live-tieout).
 * Added both so the guard actually executes in CI and is provably able to fail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-health-financial-checks";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const REQUIRED_CHECK_NAMES = [
  "ledger.unbalanced_jes",
  "ledger.ar_tieout",
  "ledger.ap_tieout",
  "ledger.orphaned_bank_matches",
  "ledger.posted_without_posting",
  "ledger.voided_without_reason",
];

/** Pure check over already-read source text, so --selftest can prove it with fixtures. */
export function checkHealthFinancialWiring(routes, checks) {
  const failures = [];
  if (!/LEDGER_FINANCIAL_HEALTH_CHECKS/.test(routes)) {
    failures.push("health.routes must import/wire LEDGER_FINANCIAL_HEALTH_CHECKS");
  }
  for (const name of REQUIRED_CHECK_NAMES) {
    if (!checks.includes(name)) {
      failures.push(`missing check name ${name}`);
    }
  }
  if (!/runBankOrphanBackfill/.test(checks)) {
    failures.push("orphaned_bank_matches must reuse runBankOrphanBackfill dry-run");
  }
  if (!/USMCA_COMPANY_ID/.test(checks)) {
    failures.push("ledger health must default to USMCA (launch-first)");
  }
  if (!/healthz\/readyz stays|readyZ stays|readyz stays/i.test(routes)) {
    failures.push("routes must document readyZ stays infra-only (Render liveness)");
  }
  // SEC-HEALTHZ: response must not interpolate cents into public error field assignment
  if (/error:\s*`[^`]*cents/.test(routes) || /error:\s*String\([^)]*cents/.test(checks)) {
    failures.push("must not put cents into public error strings on the response path");
  }
  return failures;
}

function runSelftest() {
  const goodRoutes = "import { LEDGER_FINANCIAL_HEALTH_CHECKS } from './ledger-financial-health.checks.js';\n// healthz/readyz stays infra-only (Render liveness)\n";
  const goodChecks = REQUIRED_CHECK_NAMES.map((n) => `{ name: "${n}" }`).join(",\n") + "\nrunBankOrphanBackfill\nUSMCA_COMPANY_ID\n";
  if (checkHealthFinancialWiring(goodRoutes, goodChecks).length !== 0) {
    throw new Error("selftest: fully-wired fixture must pass with zero failures — it did not");
  }

  // Planted mutation: remove the wiring import (exactly what a regression removing ACC-18's fix
  // would look like) — must fail.
  const brokenRoutes = goodRoutes.replace("import { LEDGER_FINANCIAL_HEALTH_CHECKS }", "// removed");
  const brokenFailures = checkHealthFinancialWiring(brokenRoutes, goodChecks);
  if (!brokenFailures.some((f) => f.includes("must import/wire LEDGER_FINANCIAL_HEALTH_CHECKS"))) {
    throw new Error("selftest: removing the LEDGER_FINANCIAL_HEALTH_CHECKS wiring must be flagged — it was not");
  }

  // Planted mutation: drop one required check name — must fail.
  const missingOneCheck = checkHealthFinancialWiring(goodRoutes, goodChecks.replace('{ name: "ledger.ar_tieout" },\n', ""));
  if (!missingOneCheck.some((f) => f.includes("ledger.ar_tieout"))) {
    throw new Error("selftest: removing one required check name must be flagged — it was not");
  }

  console.log(`[${LABEL}] --selftest OK (fully-wired fixture passes; removed import and removed check name both correctly detected)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const routes = read("apps/backend/src/health/health.routes.ts");
const checks = read("apps/backend/src/health/ledger-financial-health.checks.ts");
const failures = checkHealthFinancialWiring(routes, checks);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
