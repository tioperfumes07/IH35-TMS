#!/usr/bin/env node
/**
 * verify-acct-direct-creators-company-keyed-remount.mjs
 *
 * ACCT-MONEY-F6508-DIRECT-CREATORS-RETAIN-CROSS-COMPANY-DRAFT — the shared RecordExpenseForm and
 * VendorBillForm initialize substantial vendor/account/driver/unit/load/line state once and do
 * not reset it on an operatingCompanyId change. The Maintenance wrapper (MAINT-F6508) was already
 * fixed with a keyed remount; the three direct Accounting entry points
 * (VendorBillCreatePage.tsx, ExpenseCreatePage.tsx, RecordExpenseModal.tsx) could still retain a
 * stale cross-company draft.
 *
 * Guards that each of the three named entry points mounts its form with a `key` that includes
 * the company id, so a company switch forces React to fully discard the form's internal state
 * instead of carrying it into the newly-selected company.
 */
import { readFileSync } from "node:fs";

const checks = [
  {
    file: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
    keyRe: /<VendorBillForm\s*\n\s*key=\{`accounting-vendor-bill-\$\{companyId\}`\}/,
  },
  {
    file: "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx",
    keyRe: /<RecordExpenseForm\s*\n\s*key=\{`accounting-record-expense-\$\{companyId\}`\}/,
  },
  {
    file: "apps/frontend/src/components/expenses/RecordExpenseModal.tsx",
    keyRe: /<RecordExpenseForm\s*\n\s*key=\{`record-expense-modal-\$\{operatingCompanyId\}`\}/,
  },
];

const failures = [];

for (const { file, keyRe } of checks) {
  const src = readFileSync(file, "utf8");
  if (!keyRe.test(src)) {
    failures.push(`${file}: the embedded form no longer mounts with a company-keyed \`key\` prop — a company switch will retain a stale cross-company draft`);
  }
}

if (failures.length > 0) {
  console.error("verify-acct-direct-creators-company-keyed-remount: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-acct-direct-creators-company-keyed-remount: OK — all 3 direct Accounting entry points remount their form on a company change"
);
