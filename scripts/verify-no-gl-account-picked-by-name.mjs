#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md §1.2: "Then audit every other
 * account pick on a money path -- grep for account_name inside a .find( or .filter(. Every hit is
 * this defect." A name-matched GL account pick can silently resolve to the wrong account class (an
 * asset receivable instead of an expense account, in the fuel-advance case this spec names).
 *
 * Scope: LoadDetailCostsTab.tsx only (this file's own known-audited surface, per this pass). This is
 * a narrow regression lock, not the full-codebase sweep the spec's own §1.2 asks for -- that broader
 * sweep is tracked separately and not claimed as done by this guard's name.
 */
import fs from "node:fs";

const PATH = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";

function violations(src) {
  const errors = [];
  // .find(...account_name...) or .filter(...account_name...) picking a SPECIFIC account by name
  // (as opposed to categories/paymentAccounts, which filter by account_type -- a real classification,
  // not a name guess) is the defect shape.
  const findByName = /\.find\(\([^)]*\)\s*=>\s*[^)]*account_name/;
  if (findByName.test(src)) {
    errors.push("a .find(...) still resolves a specific GL account by NAME match -- bind by role instead");
  }
  return errors;
}

function check(src) {
  const errors = violations(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(PATH, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace(
      'const fuelAccount = fuelRoleRow ? chart.find((row) => row.id === fuelRoleRow.account_id) : undefined;',
      'const fuelAccount = chart.find((row) => /fuel/i.test(row.account_name));'
    ),
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(src);
  console.log(`PASS verify-no-gl-account-picked-by-name --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-no-gl-account-picked-by-name (no .find() resolves a GL account by name match)");
}
