import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecordExpenseForm } from "../../components/expenses/RecordExpenseForm";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { TaskLinkPicker } from "../../components/tasks/TaskLinkPicker";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

/**
 * Deep-link / hub create route for expenses (`/accounting/expenses`).
 * Owner chrome lock: form opens in a QBO-like right-side ParityDrawer over the accounting shell.
 * Route stays mounted; close returns to the expenses list (never remove this path).
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
            <RecordExpenseForm
              operatingCompanyId={companyId}
              idPrefix="record-expense-page"
              onSubmitted={(created) => {
                pushToast("Expense recorded", "success");
                setLastExpenseId(created?.targetId ?? null);
              }}
            />
            {lastExpenseId ? (
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="text-xs text-gray-600">Close an open task this expense fulfils:</span>
                <TaskLinkPicker
                  operatingCompanyId={companyId}
                  targetType="expense"
                  targetId={lastExpenseId}
                  onLinked={() => setLastExpenseId(null)}
                />
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
