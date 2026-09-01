import type { ExpenseListRow } from "../../api/accounting";
import type { BulkPrecheckRow } from "./bulkClientPrecheck";
import { expenseBulkRowLabel } from "./bulkRowLabels";

export function expenseBulkPrecheckRows(expenses: ExpenseListRow[]): BulkPrecheckRow[] {
  return expenses.map((expense) => ({
    id: expense.id,
    label: expenseBulkRowLabel(expense),
    blockedReason: expense.status === "void" ? "Expense is already void" : null,
  }));
}
