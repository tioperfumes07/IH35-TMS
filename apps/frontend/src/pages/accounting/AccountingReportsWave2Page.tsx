import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTrialBalanceReport } from "../../api/accounting-wave2";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents } from "../../lib/format";

export function AccountingReportsWave2Page() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState("");

  const q = useQuery({
    queryKey: ["accounting", "report-tb", companyId, asOf],
    queryFn: () => getTrialBalanceReport(companyId, asOf.trim() || undefined),
    enabled: Boolean(companyId),
  });

  const accounts = q.data?.accounts ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Accounting reports" subtitle="Trial balance (Wave 2); additional reports can be added incrementally." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <label className="block text-sm">
        As of date (optional)
        <input type="date" className="ml-2 rounded border px-2 py-1" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </label>
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Debit</th>
              <th className="px-3 py-2">Credit</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={String(a.account_id ?? a.id)} className="border-b border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{String(a.account_number ?? "—")}</td>
                <td className="px-3 py-2">{String(a.account_name ?? "—")}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{String(a.account_type ?? "—")}</td>
                <td className="px-3 py-2">{formatCurrencyCents(Number(a.debit_cents ?? 0))}</td>
                <td className="px-3 py-2">{formatCurrencyCents(Number(a.credit_cents ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && accounts.length === 0 ? <p className="p-4 text-sm text-gray-600">No rows.</p> : null}
      </div>
    </div>
  );
}
