#!/usr/bin/env node
/**
 * INS-F02 — an insurance claim must be able to reach every side of the business it touches.
 *
 * A claim is legal + financial evidence. Verified on prod 2026-08-02 via pg_constraint, it already
 * carried seven canonical FKs — policy, asset (vehicle), trailer, driver, load, accident_report
 * (safety), tenant — and could reach NONE of the money side: no repair vendor, no A/P bill, no
 * expense, no lawsuit, no driver deduction, no driver liability. driver_liabilities wired only to
 * internal fines and never to claims.
 *
 * This guard asserts the six links stay declared. It checks the MIGRATION rather than a live DB so it
 * runs in CI without a database, and it names each target explicitly: a link that silently loses its
 * FK degrades to an unenforced id column, which is how orphaned money references appear.
 *
 * IT DOES NOT ASSERT ROUTING. Whether a claim becomes a driver deduction, an insurance liability or a
 * company expense is an owner decision that has not been made. The capability is guarded; the policy
 * is deliberately absent, and this guard must never be extended to imply one.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-insurance-claim-linkage";
const REQUIRED = [
  ["vendor_id", "mdata.vendors"],
  ["bill_id", "accounting.bills"],
  ["expense_id", "accounting.expenses"],
  ["lawsuit_id", "insurance.lawsuit"],
  ["deduction_id", "driver_finance.driver_settlement_deductions"],
  ["liability_id", "driver_finance.driver_liabilities"],
];
// NOTE: no loose RETIRE-table scan here. A first version scanned the CONCATENATED migration text for
// RETIRE names and fired on any migration in the tree that merely mentioned one — three false
// positives on the real repo. The REQUIRED list above already pins every claim link to its exact
// canonical target by name, which is the stronger assertion; policing RETIRE writes globally is
// verify-canonical-table-writes' job, not this guard's.

export function audit(text) {
  const problems = [];
  for (const [col, target] of REQUIRED) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\s+uuid[\\s\\S]{0,120}?REFERENCES\\s+${target.replace(".","\\.")}\\(id\\)`, "i").test(text)) {
      problems.push(
        `${DIR}: insurance.claim link ${col} -> ${target} is not declared in any migration. A claim ` +
          `that cannot reach ${target} leaves that side of the business unreachable from the claim.`
      );
    }
  }
  return problems;
}

/**
 * ONLY the migrations that actually declare insurance.claim foreign keys.
 *
 * A first version concatenated EVERY migration and asked whether each required string appeared
 * anywhere in the result. That cannot attribute what it finds: mutation-testing showed removing
 * 'vendor_id' from the claim migration still passed, because some unrelated migration also contains
 * the token 'vendor_id'. Same defect the RETIRE scan had. Scope the text to the files that declare
 * these FKs and the assertion becomes real.
 */
function tree() {
  return readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, DIR, f), "utf8"))
    .filter((src) => /insurance\.claim/.test(src) && /ADD COLUMN IF NOT EXISTS/i.test(src))
    .join("\n");
}

function selftest() {
  const failures = [];
  if (audit(tree()).length !== 0) failures.push(`case0 FAIL — real migrations flagged: ${audit(tree()).join(" | ")}`);
  if (!audit("nothing here").some((p) => p.includes("vendor_id")))
    failures.push("case1 FAIL — a missing link declaration was NOT caught");
  const partial = tree().replace(/ADD COLUMN IF NOT EXISTS liability_id uuid/g, "ADD COLUMN IF NOT EXISTS zz uuid");
  if (!audit(partial).some((p) => p.includes("liability_id")))
    failures.push("case2 FAIL — removing one link was NOT caught");
  if (failures.length) { for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`); process.exit(1); }
  console.log(`${LABEL}: selftest PASS — missing link caught, single-link removal caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = audit(tree());
  if (problems.length) { for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
  console.log(`${LABEL} OK — all six insurance.claim money-side links are declared and canonical`);
}
main();
