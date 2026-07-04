import { useState } from "react";
import { RecordExpenseForm } from "../../components/expenses/RecordExpenseForm";
import { TaskLinkPicker } from "../../components/tasks/TaskLinkPicker";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function ExpenseCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [lastExpenseId, setLastExpenseId] = useState<string | null>(null);

  return (
    <AccountingSubNavWrapper title="Expenses" subtitle="Record a vendor expense or bill payment">
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <div className="mx-auto max-w-3xl rounded-sm border border-gray-200 bg-white p-4">
        {companyId ? (
          <RecordExpenseForm
            operatingCompanyId={companyId}
            idPrefix="record-expense-page"
            onSubmitted={(created) => {
              pushToast("Expense recorded", "success");
              setLastExpenseId(created?.targetId ?? null);
            }}
          />
        ) : null}
        {companyId && lastExpenseId ? (
          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
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
    </AccountingSubNavWrapper>
  );
}
