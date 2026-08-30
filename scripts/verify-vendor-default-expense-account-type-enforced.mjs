#!/usr/bin/env node
/** Vendor default expense account must be Expense-type and company scoped. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/vendors.routes.ts";
const source = readFileSync(join(repoRoot, TARGET), "utf8");
const checks = [
  ["shared validator", /function\s+checkDefaultExpenseAccountIsExpenseType\s*\(/],
  ["validator accepts company", /accountId:\s*string,\s*operatingCompanyId:\s*string/],
  ["Expense type enforced", /accountType === "Expense"/],
  ["account id predicate", /function\s+checkDefaultExpenseAccountIsExpenseType[\s\S]{0,900}WHERE id = \$1/],
  ["account company predicate", /function\s+checkDefaultExpenseAccountIsExpenseType[\s\S]{0,900}AND operating_company_id = \$2::uuid/],
  ["account query binds company", /\[accountId, operatingCompanyId\]/],
  ["create resolves company first", /const createOperatingCompanyId = await withCurrentUser/],
  ["create passes company", /b\.default_expense_account_id as string,\s*createOperatingCompanyId/],
  ["patch resolves vendor company", /const patchScopedCompanyId = needsScopedVendor\s*\? await resolveVendorRowOperatingCompanyId/],
  ["patch rejects missing vendor", /if \(needsScopedVendor && !patchScopedCompanyId\)/],
  ["patch passes company", /b\.default_expense_account_id as string,\s*patchScopedCompanyId as string/],
  ["create write retained", /addOptional\("default_expense_account_id"/],
  ["patch write retained", /add\("default_expense_account_id"/],
];

function failures(text) {
  return checks.filter(([, pattern]) => !pattern.test(text)).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const baseline = failures(source);
  if (baseline.length) {
    console.error(`FAIL baseline: ${baseline.join(", ")}`);
    process.exit(1);
  }
  let caught = 0;
  const escaped = [];
  for (const [name, pattern] of checks) {
    const match = source.match(pattern)?.[0];
    if (!match) process.exit(1);
    const mutated = source.replace(match, `/* planted ${name} regression */`);
    if (failures(mutated).includes(name)) caught += 1;
    else escaped.push(name);
  }
  if (caught !== checks.length) {
    console.error(`FAIL selftest: caught ${caught}/${checks.length}; escaped=${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS selftest: ${caught}/${checks.length} vendor account-scope mutations caught`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-vendor-default-expense-account-type-enforced: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("PASS verify-vendor-default-expense-account-type-enforced — type + company scope + 2 writes");
