import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getIntegrationTransactions, type IntegrationTxnItem } from "../../api/integration-transactions";

const fmtCents = (c: number | null) =>
  c == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");

const STATUS_COLOR: Record<string, string> = {
  synced: "bg-emerald-100 text-emerald-800",
  pending: "bg-yellow-100 text-yellow-800",
  in_flight: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-800",
  blocked: "bg-gray-100 text-gray-700",
};

const ENTITY_LABELS: Record<string, string> = {
  bank_transaction: "Bank Txn", bill: "Bill", expense: "Expense",
  invoice: "Invoice", journal_entry: "Journal Entry",
};

export function IntegrationTransactionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [syncStatus, setSyncStatus] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["integration-transactions", operatingCompanyId, syncStatus, entityType, search, offset],
    queryFn: () => getIntegrationTransactions({
      operating_company_id: operatingCompanyId,
      sync_status: syncStatus || undefined,
      entity_type: entityType || undefined,
      q: search || undefined,
      limit, offset,
    }),
    enabled: Boolean(selectedCompanyId),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <AccountingSubNavWrapper title="Integration Transactions" subtitle="QBO sync queue — all entity sync statuses">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search" placeholder="Search description, QBO ID…" value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <select value={syncStatus} onChange={(e) => { setSyncStatus(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">All statuses</option>
          {(["pending","in_flight","synced","failed","blocked"] as const).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">All types</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto self-center text-xs text-gray-500">{total.toLocaleString()} record{total !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load integration transactions.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No integration transactions found.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Date","Type","Description / Merchant","Amount","Sync Status","QBO ID","Attempts","Synced At","Linked To"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((row: IntegrationTxnItem) => {
                const bt = row.bank_transaction;
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmtDate(bt?.txn_date ?? row.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                        {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-gray-800">
                      {bt?.merchant_name || bt?.description || <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                      {bt ? (
                        <span className={bt.is_credit ? "text-emerald-700" : "text-gray-800"}>
                          {bt.is_credit ? "+" : "-"}{fmtCents(bt.amount_cents)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.sync_status] ?? "bg-gray-100 text-gray-700"}`}>
                        {row.sync_status}
                      </span>
                      {row.error_message && (
                        <span className="ml-1 text-xs text-red-600 truncate max-w-[160px] inline-block align-middle" title={row.error_message}>
                          {row.error_message.slice(0, 40)}{row.error_message.length > 40 ? "…" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{row.qbo_id ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-center text-gray-600">{row.attempt_count}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{fmtDate(row.synced_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {bt?.matched_load_id && <Link to={`/dispatch/loads/${bt.matched_load_id}`} className="text-slate-700 hover:underline mr-2">Load</Link>}
                      {bt?.matched_bill_id && <Link to={`/accounting/bills/${bt.matched_bill_id}`} className="text-slate-700 hover:underline">Bill</Link>}
                      {!bt?.matched_load_id && !bt?.matched_bill_id && <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default IntegrationTransactionsPage;
