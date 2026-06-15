#!/usr/bin/env node
/**
 * Static guard for GAP-EXPENSES Phase 2 Step 2 (Uncategorized-Expenses seed). Locks:
 *  - migration 202606151500 widens chart_of_accounts_roles_role_check to include
 *    'uncategorized_expense', seeds the catalogs.accounts row, and seeds the per-company
 *    role with the PARTIAL-index ON CONFLICT predicate (WHERE is_active = true);
 *  - the typed COA_ROLE_VALUES includes 'uncategorized_expense' (so the role is resolvable).
 * Pure file-content; no DB. Safe in CI.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "db/migrations/202606151500_expense_uncategorized_account_and_role.sql";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";

let failed = 0;
const fail = (m) => { console.error(`verify-uncategorized-expense-seed: ${m}`); failed = 1; };
const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { fail(`expected file missing: ${rel}`); return ""; }
  return fs.readFileSync(p, "utf8");
};

const mig = read(MIGRATION);
if (mig) {
  if (!/chart_of_accounts_roles_role_check[\s\S]*'uncategorized_expense'/i.test(mig))
    fail(`${MIGRATION} must widen chart_of_accounts_roles_role_check to include 'uncategorized_expense'.`);
  if (!/INSERT INTO catalogs\.accounts[\s\S]*'Uncategorized Expenses'[\s\S]*'Expense'/i.test(mig))
    fail(`${MIGRATION} must seed the catalogs.accounts 'Uncategorized Expenses' (Expense) account.`);
  if (!/INSERT INTO accounting\.chart_of_accounts_roles[\s\S]*'uncategorized_expense'/i.test(mig))
    fail(`${MIGRATION} must seed the per-company uncategorized_expense role.`);
  // the partial unique index requires the predicate in ON CONFLICT
  if (!/ON CONFLICT\s*\(operating_company_id,\s*role\)\s*WHERE\s+is_active\s*=\s*true\s+DO NOTHING/i.test(mig))
    fail(`${MIGRATION} role seed must use ON CONFLICT (operating_company_id, role) WHERE is_active = true (the real partial unique index uq_coa_roles_company_role_active).`);
  // catalogs.accounts is the posting CoA — must NOT seed into the QBO mirror
  if (/INSERT INTO accounting\.coa_account\b/i.test(mig))
    fail(`${MIGRATION} must seed catalogs.accounts (the GL posting CoA), NOT accounting.coa_account (the QBO mirror).`);
}

const resolver = read(RESOLVER);
if (resolver && !/COA_ROLE_VALUES[\s\S]*"uncategorized_expense"/.test(resolver))
  fail(`${RESOLVER} COA_ROLE_VALUES must include "uncategorized_expense".`);

if (failed) process.exit(1);
console.log("verify-uncategorized-expense-seed: OK — seed (catalogs.accounts) + role + CHECK widen + partial-index ON CONFLICT + COA_ROLE_VALUES locked.");
