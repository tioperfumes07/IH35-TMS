#!/usr/bin/env node
/**
 * COMP-F71 — the CSA BASIC pull must only attempt companies whose USDOT number is a real number.
 *
 * WHY THIS EXISTS (prod br-fancy-credit-akjnd07a, 2026-08-01):
 * org.companies.usdot_number holds TRANSP = NULL, TRK = NULL, USMCA = 'PENDING-USMCA-DOT'. The
 * selection filtered only on not-null, so the PLACEHOLDER passed, was sent to the live public SAFER
 * lookup, and returned public_csa_basic_source_unavailable — recorded as a job failure on every run.
 * _system.background_jobs: compliance.csa_basic_pull_cron last succeeded 2026-06-30, and its latest
 * error is literally "success=0 failures=1 details=5c854333-…:public_csa_basic_source_unavailable".
 *
 * A carrier that has not been issued a DOT number yet is a DESIGNED state — the placeholder is how
 * that state is expressed — so recording it as a failure is the same mistake as asking USMCA to sync
 * a QuickBooks it does not have. Permanent expected noise is what buries real signal.
 *
 * It also stops a sentinel string being transmitted to an external regulator lookup, which is its own
 * small correctness problem: SAFER should never be queried for "PENDING-USMCA-DOT".
 *
 * SEPARATE AND LARGER, deliberately NOT fixed in code: TRANSP and TRK — the two real operating
 * carriers — have NO usdot_number at all, so CSA data cannot be pulled for the entities that actually
 * run freight. That is owner data, not something an agent may invent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/compliance/csa-basic-pull.ts";
const LABEL = "verify-csa-pull-skips-non-numeric-usdot";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

export function auditSelection(src) {
  const code = stripComments(src);
  const problems = [];
  const m = /FROM\s+org\.companies[\s\S]*?ORDER BY id/i.exec(code);
  if (!m) {
    problems.push(`${SVC}: could not find the company selection — cannot verify placeholder USDOTs are skipped.`);
    return problems;
  }
  const sql = m[0];
  if (!/~\s*'\^\[0-9\]\+\$'/.test(sql)) {
    problems.push(
      `${SVC}: the company selection does not require a NUMERIC usdot_number. A placeholder such as ` +
        `'PENDING-USMCA-DOT' passes a not-null check, gets sent to the live SAFER lookup, and is ` +
        `recorded as a job failure every run — expected state reported as breakage.`
    );
  }
  return problems;
}

function auditTree() {
  return auditSelection(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  const bare = `FROM org.companies WHERE is_active = true AND NULLIF(trim(COALESCE(usdot_number, '')), '') IS NOT NULL ORDER BY id`;
  if (auditSelection(bare).length === 0) failures.push("case1 FAIL — a not-null-only selection was NOT caught");
  const numeric = `FROM org.companies WHERE is_active = true AND NULLIF(trim(COALESCE(usdot_number, '')), '') IS NOT NULL AND trim(usdot_number) ~ '^[0-9]+$' ORDER BY id`;
  if (auditSelection(numeric).length !== 0) failures.push("case2 FAIL — the numeric-guarded selection was flagged");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case3 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — not-null-only selection caught, numeric-guarded selection clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — CSA pull attempts only companies with a numeric USDOT number`);
}

main();
