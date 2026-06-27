import { RecordExpenseForm } from "../../components/expenses/RecordExpenseForm";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

export function ExpenseCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  return (
    <AccountingSubNavWrapper title="Expenses" subtitle="Record a vendor expense or bill payment">
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <div className="mx-auto max-w-3xl rounded border border-gray-200 bg-white p-4">
        {companyId ? (
          <RecordExpenseForm
            operatingCompanyId={companyId}
            idPrefix="record-expense-page"
            onSubmitted={() => pushToast("Expense recorded as vendor bill", "success")}
          />
        ) : null}
      </div>
    </AccountingSubNavWrapper>
  );
}
