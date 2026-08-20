#!/usr/bin/env node
/**
 * expense COLUMN-WAVE — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["banking"],"cols":["expense"],"task":"WAVE-C-expense-banking-transactions","vertical":"column-wave","leafRe":"^transactions\\.(list|categorize)$"}
 *
 * Audited every priority-10 module for the expense reverse-link. accounting (hub), settlements
 * (own GL machinery, no accounting.expenses touch), factoring (fee posts directly to GL, documented
 * no-op for expense-as-row), customers, safety (fines post via own JE leaf), lists — all N/A, no
 * money-posting leaf owns an accounting.expenses row. vendors already WIRED (VendorDetail.tsx A/P
 * tab). Three real gaps found and fixed:
 *   - dispatch: LoadDetailDrawer.tsx's "Open expenses" linked ?load_id= but ExpensesListPage.tsx
 *     only ever read ?expense_id= — the count/existence proof was real, only the click-through
 *     filter was dropped.
 *   - banking: reconciliation.routes.ts's own "matched" computation (list + summary + accept-session
 *     endpoints) never counted matched_expense_id, so a transaction matched only to an expense showed
 *     as unmatched/uncleared in the Reconciliation Workspace even though the accounting-side
 *     ExpenseDetailPage.tsx already rendered the reverse link correctly.
 *   - drivers: accounting.expenses.driver_uuid was fully wired server-side (create/list/detail by
 *     driver) since the route's original build, but RecordExpenseForm.tsx had no driver field and no
 *     Driver page ever read/filtered by it — added the picker (write) + a driver-attributed-expenses
 *     section on EarningsTab.tsx (read).
 *
 * Self-test: node scripts/verify-expense-column-wave.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-column-wave";

const CHECKS = [
  {
    name: "dispatch: ExpensesListPage reads load_id from the URL",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /searchParams\.get\("load_id"\)/,
  },
  {
    name: "ACCT-F5048: ExpensesListPage reads trailer_id from the URL",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /searchParams\.get\("trailer_id"\)/,
  },
  {
    name: "ACCT-F5048: ExpensesListPage reads unit_id from the URL",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /searchParams\.get\("unit_id"\)/,
  },
  {
    name: "LST-F5195: ExpensesListPage entity filters write URL",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /dataTestId="expenses-filter-driver"/,
  },
  {
    name: "LST-F5195: ExpensesListPage staged Apply writes entity URL keys",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /onApply:\s*\(next\)\s*=>[\s\S]*?params\.set\("load_id"|params\.set\("driver_id"|params\.set\("unit_id"|params\.set\("trailer_id"/,
  },
  {
    name: "LST-F5195: ExpensesListPage must not keep silent patchEntityFilter",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /^(?![\s\S]*function patchEntityFilter)[\s\S]*useStagedListFilters/,
  },
  {
    name: "ACCT-F5048: ExpensesListPage Trailer column EntityLink",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /kind="trailer"[\s\S]{0,80}?r\.trailer_id/,
  },
  {
    name: "ACCT-F5048: ExpensesReverseSection Open Expenses keeps filter query",
    file: "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx",
    pattern: /to=\{`\/accounting\/expenses\?\$\{filterKey\}=/,
  },
  {
    name: "banking: reconciliation.routes.ts counts matched_expense_id",
    file: "apps/backend/src/banking/reconciliation.routes.ts",
    pattern: /matched_settlement_id \|\| t\.matched_expense_id/,
  },
  {
    name: "banking: ReconciliationWorkspace renders the expense EntityLink",
    file: "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx",
    pattern: /kind="expense" id=\{tx\.matched_expense_id\}/,
  },
  {
    name: "drivers: RecordExpenseForm has a driver picker",
    file: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    pattern: /record-expense-driver-picker/,
  },
  {
    name: "drivers: recordExpenseSubmit sends driver_id",
    file: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
    pattern: /values\.driverId && UUID_RE\.test\(values\.driverId\)/,
  },
  {
    name: "drivers: EarningsTab renders driver-attributed expenses",
    file: "apps/frontend/src/components/drivers/EarningsTab.tsx",
    pattern: /driver-earnings-expenses/,
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
  const expenseRoutes = readFile("apps/backend/src/accounting/expenses.routes.ts");
  if (expenseRoutes === null) {
    failures.push("accounting: expenses.routes.ts not found");
  } else {
    const scopedWoJoins = expenseRoutes.match(/wo\.id = e\.linked_work_order_uuid(?:\s|\")+AND wo\.operating_company_id = e\.operating_company_id/g) ?? [];
    if (scopedWoJoins.length < 2) {
      failures.push(`accounting: expense list/detail work-order joins must both be company-scoped (found ${scopedWoJoins.length}/2)`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/accounting/ExpensesListPage.tsx":
      'searchParams.get("load_id") searchParams.get("trailer_id") searchParams.get("unit_id") kind="trailer" id={r.trailer_id} dataTestId="expenses-filter-driver" onApply: (next) => { params.set("load_id", next.loadId); useStagedListFilters',
    "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx":
      "to={`/accounting/expenses?${filterKey}=",
    "apps/backend/src/banking/reconciliation.routes.ts": "t.matched_settlement_id || t.matched_expense_id",
    "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx": 'kind="expense" id={tx.matched_expense_id}',
    "apps/frontend/src/components/expenses/RecordExpenseForm.tsx": 'data-testid="record-expense-driver-picker"',
    "apps/frontend/src/components/expenses/recordExpenseSubmit.ts": "values.driverId && UUID_RE.test(values.driverId)",
    "apps/frontend/src/components/drivers/EarningsTab.tsx": 'data-testid="driver-earnings-expenses"',
    "apps/backend/src/accounting/expenses.routes.ts": `
      wo.id = e.linked_work_order_uuid AND wo.operating_company_id = e.operating_company_id
      wo.id = e.linked_work_order_uuid AND wo.operating_company_id = e.operating_company_id
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length + 1) {
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
console.log(`[${LABEL}] PASS — dispatch/banking/drivers expense reverse-link (3 leaf fixes) all present`);
