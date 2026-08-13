#!/usr/bin/env node
/**
 * WAVE-C-gl_je-accounting-core-leaves — accounting module "GL / JE" column,
 * VERTICAL-WIRING-LAW-2026-08-12. These leaves already render a real EntityLink
 * kind="journal_entry" (or create through a form that posts via postSourceTransaction)
 * — they must stay tagged @matrix-built:
 *   - bills.list / bills.detail / expenses.list / expenses.detail
 *   - bill_payments.list/create / je.list/create / register
 *   - accounting.panel.bill_detail (BillDetailPanel journal_entry EntityLink — ACCT-F5045)
 *   - accounting.parity.expense_create_page / expenses_list_page / vendor_bill_create_page
 *   - accounting.parity.factoring_detail_page
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(bills\\.list|bills\\.detail|expenses\\.list|expenses\\.detail|bill_payments\\.list|bill_payments\\.create|je\\.list|je\\.create|register|accounting\\.panel\\.bill_detail|accounting\\.parity\\.(expense_create_page|expenses_list_page|vendor_bill_create_page|factoring_detail_page))$","task":"WAVE-C-gl_je-accounting-core-leaves","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-accounting-core-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-accounting-core-leaves";

const CHECKS = [
  {
    name: "bills.list: BillsPage.tsx rows resolve to BillDetailPage (bills.detail)",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /\/accounting\/bills\/:id|BillDetailPage/,
  },
  {
    name: "bills.detail: BillDetailPage.tsx renders bill.journal_entry_id",
    file: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    pattern: /bill\.journal_entry_id/,
  },
  {
    name: "expenses.list: ExpensesListPage.tsx renders journal_entry_id column",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /journal_entry_id/,
  },
  {
    name: "expenses.detail: ExpenseDetailPage.tsx renders expense.journal_entry_id",
    file: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
    pattern: /expense\.journal_entry_id/,
  },
  {
    name: "bill_payments.list/create: BillPaymentsListPage.tsx renders journal_entry_id column",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    pattern: /journal_entry_id/,
  },
  {
    name: "je.list/je.create: ManualJEListPage.tsx renders EntityLink kind=journal_entry",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /kind="journal_entry"/,
  },
  {
    name: "register: AccountRegisterPage.tsx renders e.journal_entry_id per ledger line",
    file: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
    pattern: /e\.journal_entry_id/,
  },
  {
    name: "accounting.panel.bill_detail: BillDetailPanel EntityLink journal_entry (ACCT-F5045)",
    file: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx",
    pattern: /kind="journal_entry"/,
  },
  {
    name: "parity.expense_create_page: ExpenseCreatePage mounts RecordExpenseForm",
    file: "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx",
    pattern: /RecordExpenseForm/,
  },
  {
    name: "parity.expenses_list_page: ExpensesListPage journal_entry column",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /kind="journal_entry"/,
  },
  {
    name: "parity.vendor_bill_create_page: VendorBillCreatePage mounts VendorBillForm",
    file: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
    pattern: /VendorBillForm/,
  },
  {
    name: "parity.factoring_detail_page: FactoringDetailPage EntityLink journal_entry",
    file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    pattern: /kind="journal_entry"/,
  },
  {
    name: "list bills include BILL_JOURNAL_ENTRY_ID_SQL (ACCT-F5045 panel feed)",
    file: "apps/backend/src/accounting/bills.service.ts",
    pattern: /BILL_JOURNAL_ENTRY_ID_SQL/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/accounting/BillsPage.tsx": "navigate to /accounting/bills/:id BillDetailPage",
    "apps/frontend/src/pages/accounting/BillDetailPage.tsx": "bill.journal_entry_id",
    "apps/frontend/src/pages/accounting/ExpensesListPage.tsx": 'journal_entry_id kind="journal_entry"',
    "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx": "expense.journal_entry_id",
    "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx": "journal_entry_id",
    "apps/frontend/src/pages/accounting/ManualJEListPage.tsx": 'kind="journal_entry"',
    "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx": "e.journal_entry_id",
    "apps/frontend/src/pages/accounting/BillDetailPanel.tsx": 'kind="journal_entry"',
    "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx": "RecordExpenseForm",
    "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx": "VendorBillForm",
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx": 'kind="journal_entry"',
    "apps/backend/src/accounting/bills.service.ts": "BILL_JOURNAL_ENTRY_ID_SQL",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(
  `[${LABEL}] PASS — core + bill_detail panel + expense/vendor-bill/factoring parity gl_je wiring present`,
);
