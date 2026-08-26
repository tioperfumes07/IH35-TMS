import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecordExpenseForm } from "../../components/expenses/RecordExpenseForm";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { TaskLinkPicker } from "../../components/tasks/TaskLinkPicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

/**
 * Create-only alias for expenses (`/accounting/expenses/new`).
 * Canonical browse is `/accounting/expenses` (ExpensesListPage + Create drawer).
 * Owner chrome lock: form opens in a QBO-like right-side ParityDrawer over the accounting shell.
 * Close returns to the list.
 */
export function ExpenseCreatePage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [lastExpenseId, setLastExpenseId] = useState<string | null>(null);

  return (
    <AccountingSubNavWrapper title="Expenses" subtitle="Record a vendor expense or bill payment">
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <p className="text-sm text-gray-600">
        Recording an expense in the side panel.{" "}
        <button
          type="button"
          className="text-slate-700 underline"
          onClick={() => navigate("/accounting/expenses/list")}
        >
          Open expenses list
        </button>
      </p>
      <ParityDrawer
        open
        title="Record expense"
        subtitle="Expense capture"
        size="wide"
        onClose={() => navigate("/accounting/expenses/list")}
      >
        {companyId ? (
          <div className="space-y-4">
            {/* ACCT-MONEY-F6508-DIRECT-CREATORS-RETAIN-CROSS-COMPANY-DRAFT — RecordExpenseForm
                initializes substantial vendor/account/driver/unit/load/line state once and never
                resets it on an operatingCompanyId change; a keyed remount (same fix already
                shipped for the Maintenance wrapper, MAINT-F6508) forces React to discard all
                internal state instead of carrying a stale draft into the new company. */}
            <RecordExpenseForm
              key={`accounting-record-expense-${companyId}`}
              operatingCompanyId={companyId}
              idPrefix="record-expense-page"
              onSubmitted={(created) => {
                pushToast("Expense recorded", "success");
                setLastExpenseId(created?.targetId ?? null);
              }}
            />
            {lastExpenseId ? (
              <div className="space-y-2 border-t border-gray-200 pt-3">
                {/* LINK-F5186 (accounting.parity.expense_create_page): the created expense's own
                detail page carries the real GL journal entry -- surface it here so the operator
                isn't left in a drawer with no path to it. */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Expense recorded.</span>
                  <EntityLink
                    kind="expense"
                    id={lastExpenseId}
                    label="View expense →"
                    className="text-xs font-semibold text-slate-700 underline"
                    data-testid="expense-create-view-expense"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Close an open task this expense fulfils:</span>
                  <TaskLinkPicker
                    operatingCompanyId={companyId}
                    targetType="expense"
                    targetId={lastExpenseId}
                    onLinked={() => setLastExpenseId(null)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-red-600">Select an operating company in the shell header.</div>
        )}
      </ParityDrawer>
    </AccountingSubNavWrapper>
  );
}
