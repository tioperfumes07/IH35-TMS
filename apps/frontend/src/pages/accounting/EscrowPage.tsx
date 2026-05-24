import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listEscrowAccounts, listEscrowPostings, type EscrowAccount, type EscrowPosting } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function dt(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function EscrowPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const accountsQuery = useQuery({
    queryKey: ["accounting", "escrow", "accounts", companyId],
    queryFn: () => listEscrowAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const postingsQuery = useMutation({
    mutationFn: (escrowAccountId: string) => listEscrowPostings(companyId, escrowAccountId, 300),
  });

  const selectedAccount = useMemo(
    () => ((accountsQuery.data?.rows ?? []) as EscrowAccount[]).find((row) => row.id === selectedAccountId) ?? null,
    [accountsQuery.data?.rows, selectedAccountId]
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Escrow" subtitle="Escrow accounts and posting history" />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      {accountsQuery.isLoading ? <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500">Loading escrow accounts...</div> : null}

      {accountsQuery.data?.rows && accountsQuery.data.rows.length > 0 ? (
        <div className="overflow-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2">Holder</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Purpose</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Balance</th>
                <th className="px-2 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(accountsQuery.data.rows as EscrowAccount[]).map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-slate-100 ${selectedAccountId === row.id ? "bg-emerald-50" : ""}`}
                  onClick={() => {
                    setSelectedAccountId(row.id);
                    postingsQuery.mutate(row.id);
                  }}
                >
                  <td className="px-2 py-2 font-mono">{row.holder_id}</td>
                  <td className="px-2 py-2">{row.holder_type}</td>
                  <td className="px-2 py-2">{row.purpose}</td>
                  <td className="px-2 py-2">{row.status}</td>
                  <td className="px-2 py-2">{money(row.balance_cents)}</td>
                  <td className="px-2 py-2">{dt(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {accountsQuery.data?.rows && accountsQuery.data.rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500">No escrow accounts found.</div>
      ) : null}

      {selectedAccount ? (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
          Selected account: <span className="font-mono">{selectedAccount.id}</span> · Balance {money(selectedAccount.balance_cents)}
        </div>
      ) : null}

      {postingsQuery.data?.rows && postingsQuery.data.rows.length > 0 ? (
        <div className="overflow-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-2 py-2">Posted</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Journal entry</th>
              </tr>
            </thead>
            <tbody>
              {(postingsQuery.data.rows as EscrowPosting[]).map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{dt(row.posted_at)}</td>
                  <td className="px-2 py-2">{row.posting_type}</td>
                  <td className="px-2 py-2">{money(row.amount_cents)}</td>
                  <td className="px-2 py-2">
                    {row.source_type}
                    {row.source_id ? ` / ${row.source_id}` : ""}
                  </td>
                  <td className="px-2 py-2 font-mono">{row.linked_journal_entry_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
