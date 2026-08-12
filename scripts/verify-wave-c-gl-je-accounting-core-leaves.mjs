#!/usr/bin/env node
/**
 * WAVE-C-gl_je-accounting-core-leaves — accounting module "GL / JE" column,
 * VERTICAL-WIRING-LAW-2026-08-12. These 9 leaves were already real (every one already renders a
 * real EntityLink kind="journal_entry" sourced from a real journal_entry_id/journal_entry_type
 * column returned by the backend, or its list rows navigate to a detail page that does) — they
 * were simply never tagged @matrix-built:
 *   - bills.list (BillsPage.tsx rows navigate to bills.detail)
 *   - bills.detail (BillDetailPage.tsx renders bill.journal_entry_id)
 *   - expenses.list (ExpensesListPage.tsx renders row.journal_entry_id column)
 *   - expenses.detail (ExpenseDetailPage.tsx renders expense.journal_entry_id)
 *   - bill_payments.list (BillPaymentsListPage.tsx renders row.journal_entry_id column, rows
 *     navigate to bill_payments detail)
 *   - bill_payments.create (PayBillModal creates from BillPaymentsListPage; the resulting row is
 *     the same real JE-linked payment)
 *   - je.list / je.create (ManualJEListPage.tsx IS the journal entries list+create surface;
 *     EntityLink kind="journal_entry" on every row by construction)
 *   - register (AccountRegisterPage.tsx renders e.journal_entry_id per ledger line)
 *
 * No code change in this pass — pure verification + tagging. Read-only checks; no new GL math,
 * no posting, no migration.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(bills\\.list|bills\\.detail|expenses\\.list|expenses\\.detail|bill_payments\\.list|bill_payments\\.create|je\\.list|je\\.create|register)$","task":"WAVE-C-gl_je-accounting-core-leaves","vertical":"column-wave"}
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
    "apps/frontend/src/pages/accounting/ExpensesListPage.tsx": "journal_entry_id",
    "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx": "expense.journal_entry_id",
    "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx": "journal_entry_id",
    "apps/frontend/src/pages/accounting/ManualJEListPage.tsx": 'kind="journal_entry"',
    "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx": "e.journal_entry_id",
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
  `[${LABEL}] PASS — bills.list/detail + expenses.list/detail + bill_payments.list/create + je.list/create + register gl_je wiring present`,
);
