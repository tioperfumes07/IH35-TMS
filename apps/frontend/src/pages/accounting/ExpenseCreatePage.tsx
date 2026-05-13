import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ExpenseCreateForm } from "./ExpenseCreateModal";

export function ExpenseCreatePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Create expense" subtitle="Uses vendor bills API today with QuickBooks vendor + account reference fields." />
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <div className="mx-auto max-w-3xl rounded border border-gray-200 bg-white p-4">
        <ExpenseCreateForm operatingCompanyId={companyId} />
      </div>
    </div>
  );
}
