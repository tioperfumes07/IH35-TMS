import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getBankingTransactionsReview } from "../../api/banking-wave2";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents, formatDate } from "../../lib/format";

export function BankingTransactionsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"" | "for_review" | "categorized" | "excluded">("");

  const q = useQuery({
    queryKey: ["banking", "transactions-list", companyId, search, state],
    queryFn: () =>
      getBankingTransactionsReview(companyId, {
        search: search.trim() || undefined,
        state: state || undefined,
        limit: 100,
      }),
    enabled: Boolean(companyId),
  });

  const rows = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Bank transactions" subtitle="All imported bank lines — filter by review state or search." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Search description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
        />
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
          aria-label="Review state filter"
        >
          <option value="">All states</option>
          <option value="for_review">For review</option>
          <option value="categorized">Categorized</option>
          <option value="excluded">Excluded</option>
        </select>
      </div>
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={String(t.id)} className="border-b border-gray-100">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(String(t.transaction_date ?? ""))}</td>
                <td className="px-3 py-2">{String(t.description ?? t.merchant_name ?? "—")}</td>
                <td className="px-3 py-2">{formatCurrencyCents(Number(t.amount_cents ?? 0))}</td>
                <td className="px-3 py-2">{String(t.bank_account_name ?? "—")}</td>
                <td className="px-3 py-2">{String(t.review_state ?? t.status ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && rows.length === 0 ? <p className="p-4 text-sm text-gray-600">No rows.</p> : null}
      </div>
    </div>
  );
}
