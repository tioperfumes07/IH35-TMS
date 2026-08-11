#!/usr/bin/env node
/**
 * Static guard: ExpensesListPage must expose a Void affordance that calls the
 * canonical voidExpense endpoint, reusing the shared VoidReasonModal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const listPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/ExpensesListPage.tsx"), "utf8");
const detailPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx"), "utf8");
const errors = [];

if (!/voidExpense/.test(listPage)) {
  errors.push("ExpensesListPage does not import/use voidExpense");
}
if (!/VoidReasonModal/.test(listPage)) {
  errors.push("ExpensesListPage does not render VoidReasonModal");
}
if (!/\{r\.status\s*===\s*["']void["']\s*\?\s*["']Voided["']\s*:\s*["']Void["']\}/.test(listPage)) {
  errors.push("ExpensesListPage missing status-aware Void/Voided action label");
}
if (!/stopPropagation/.test(listPage)) {
  errors.push("ExpensesListPage void action does not stop row-click propagation");
}
if (!/invalidateQueries\(\{\s*queryKey:\s*\["accounting",\s*"expenses",\s*selectedCompanyId\]\s*\}\)/.test(listPage)) {
  errors.push("ExpensesListPage does not invalidate expenses list cache after void");
}
for (const [rel, src] of [
  ["ExpensesListPage", listPage],
  ["ExpenseDetailPage", detailPage],
]) {
  if (/\{\s*success\s*\}\s*=\s*useToast\(\)/.test(src)) {
    errors.push(`${rel} destructures toast.success — ToastContext only exposes pushToast (Render tsc fails)`);
  }
  if (!/pushToast\(\s*["']Expense voided["']\s*,\s*["']success["']\s*\)/.test(src)) {
    errors.push(`${rel} must pushToast("Expense voided", "success") after void`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Expenses list page Void affordance wired");
process.exit(0);
