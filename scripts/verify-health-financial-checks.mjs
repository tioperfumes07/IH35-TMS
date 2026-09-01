/**
 * HEALTH-FINANCIAL-CHECKS-01 — ledger.* critical probes must be wired into deep healthz.
 * SEC-HEALTHZ: public body codes only (no dollar amounts in route source as response fields).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-health-financial-checks";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const failures = [];
const routes = read("apps/backend/src/health/health.routes.ts");
const checks = read("apps/backend/src/health/ledger-financial-health.checks.ts");

if (!/LEDGER_FINANCIAL_HEALTH_CHECKS/.test(routes)) {
  failures.push("health.routes must import/wire LEDGER_FINANCIAL_HEALTH_CHECKS");
}
for (const name of [
  "ledger.unbalanced_jes",
  "ledger.ar_tieout",
  "ledger.ap_tieout",
  "ledger.orphaned_bank_matches",
  "ledger.posted_without_posting",
  "ledger.voided_without_reason",
]) {
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

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
