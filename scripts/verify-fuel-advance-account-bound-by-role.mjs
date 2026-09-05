#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md §1.2, owner ruling: "bind the fuel
 * account by role, never by name." A NAME match (`/fuel/i` against account_name) can resolve to an
 * ASSET receivable ("1250 Driver Fuel-Overage Receivable") instead of the expense account -- a
 * company fuel advance posting into a driver receivable is exactly what the owner ruled must never
 * happen. Guards that LoadDetailCostsTab.tsx resolves fuelAccount from
 * accounting.chart_of_accounts_roles (role 'company_fuel_advance_expense'), never from a name regex.
 */
import fs from "node:fs";

const PATH = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";

function violations(src) {
  const errors = [];
  if (/const fuelAccount = categories\.find\(\(row\) => \/fuel\/i\.test\(row\.account_name\)\)/.test(src)) {
    errors.push("fuelAccount is resolved by a /fuel/i NAME match -- can resolve to an asset receivable instead of the expense account");
  }
  if (!src.includes('listCoaRoles') || !src.includes('"company_fuel_advance_expense"')) {
    errors.push("fuelAccount is not resolved via listCoaRoles / the company_fuel_advance_expense role");
  }
  if (!/fuelRoleRow\.account_id/.test(src)) {
    errors.push("fuelAccount does not resolve through the role binding's account_id");
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
  const nameMatchReintroduced = src.replace(
    'const fuelRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "company_fuel_advance_expense" && row.is_active && row.account_id);\n  const fuelAccount = fuelRoleRow ? chart.find((row) => row.id === fuelRoleRow.account_id) : undefined;',
    'const fuelAccount = categories.find((row) => /fuel/i.test(row.account_name));'
  );
  const mutations = [
    nameMatchReintroduced,
    src.replaceAll("listCoaRoles", "removedListCoaRoles"),
    src.replaceAll("company_fuel_advance_expense", "removed_role"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  check(src);
  console.log(`PASS verify-fuel-advance-account-bound-by-role --selftest (${caught}/${mutations.length})`);
} else {
  check(src);
  console.log("PASS verify-fuel-advance-account-bound-by-role (fuelAccount resolved by role, never by name)");
}
