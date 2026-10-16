#!/usr/bin/env node
/**
 * 443.159 — owner 2026-10-16: "the account Dispatch — Mexico appears when categorizing in Banking but
 * not in Bills … all accounts must appear when creating a bill, any type of bill … same picker, all uniform."
 *
 * Root cause (measured on main 566f2c2a): TwoSectionLineEditor's Section A in "bill" mode read
 * catalogs.expense_categories (expenseCategoriesCatalogClient) instead of the Chart of Accounts that
 * Banking categorize reads (getCoaAccounts → /api/v1/catalogs/accounts). Accounts created in the app
 * (6110-01-001 Dispatch — Mexico, 6110-01-002 Dispatch — Laredo) never appeared on a bill.
 *
 * Guards:
 *   1. TwoSectionLineEditor loads Section A from getCoaAccounts in EVERY mode (no `mode !== "bill"` gate).
 *   2. TwoSectionLineEditor has no bill-only expense-category options branch.
 *   3. vendorBillLines sends a picked account as account_id (the poster's explicit tier).
 *   4. VendorBillForm accepts account_id as a valid Section A line.
 *
 * --selftest: re-inserts the old bill-mode gate and asserts the guard fails.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EDITOR = "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx";
const LINES = "apps/frontend/src/components/accounting/vendorBillLines.ts";
const FORM = "apps/frontend/src/components/accounting/VendorBillForm.tsx";

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function check(src = {}) {
  const editor = src.editor ?? read(EDITOR);
  const lines = src.lines ?? read(LINES);
  const form = src.form ?? read(FORM);
  const findings = [];
  if (!/queryFn:\s*\(\)\s*=>\s*getCoaAccounts\(operatingCompanyId\)/.test(editor)) {
    findings.push(`${EDITOR}: Section A does not load the Chart of Accounts via getCoaAccounts`);
  }
  if (/mode\s*!==\s*"bill"\s*&&\s*\(mode\s*===\s*"expense"/.test(editor)) {
    findings.push(`${EDITOR}: Chart of Accounts query is gated off in bill mode`);
  }
  if (/expenseCategoryOptions[\s\S]{0,200}if\s*\(mode\s*===\s*"bill"\)/.test(editor)) {
    findings.push(`${EDITOR}: bill mode still builds Section A options from the expense-categories catalog`);
  }
  if (!/account_id:\s*accountId/.test(lines)) {
    findings.push(`${LINES}: a picked Chart-of-Accounts account is not sent as account_id`);
  }
  if (!/line\.account_id/.test(form)) {
    findings.push(`${FORM}: Section A validation does not accept account_id`);
  }
  return findings;
}

if (process.argv.includes("--selftest")) {
  const editor = read(EDITOR);
  const mutated = editor.replace(
    /enabled:\s*Boolean\(operatingCompanyId\),\n(\s*staleTime: 30_000,\n\s*\}\);\n\s*const tirePositionsQuery)/,
    'enabled: Boolean(operatingCompanyId) && mode !== "bill" && (mode === "expense" || categoryFetchActive),\n$1'
  );
  if (mutated === editor) {
    console.error("SELFTEST FAIL: could not inject the old bill-mode gate");
    process.exit(1);
  }
  const findings = check({ editor: mutated });
  if (findings.length === 0) {
    console.error("SELFTEST FAIL: guard did not catch the bill-mode gate");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: caught ${findings.length} finding(s)`);
  process.exit(0);
}

const findings = check();
if (findings.length) {
  console.error(`verify-bill-section-a-uses-chart-of-accounts FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-bill-section-a-uses-chart-of-accounts PASS: bills pick from the same Chart of Accounts as Banking");
