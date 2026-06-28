import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  getPrepaidExpenses, getPrepaidExpenseDetail, createPrepaidExpense,
  type PrepaidAssetListItem, type PrepaidAssetDetail,
} from "../../api/prepaid-expenses";

const fmtCents = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");

const STATUS_COLOR: Record<string, string> = {
  active: "bg-slate-100 text-slate-700",
  fully_amortized: "bg-emerald-100 text-emerald-800",
  voided: "bg-red-100 text-red-700",
};

function SchedulePanel({ detail, onClose }: { detail: PrepaidAssetDetail; onClose: () => void }) {
  const pct = detail.total_amount_cents > 0
    ? Math.round((detail.amortized_cents / detail.total_amount_cents) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.description}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.asset_number ? `#${detail.asset_number} · ` : ""}{fmtCents(detail.total_amount_cents)} over {detail.periods} months
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Amortized: {fmtCents(detail.amortized_cents)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {detail.je_preview.purchase_je && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold mb-1">GL Posting Preview (GATED — flag OFF)</p>
            <p>Purchase JE: Dr Prepaid Asset {fmtCents(detail.total_amount_cents)} / Cr Cash {fmtCents(detail.total_amount_cents)}</p>
            {detail.je_preview.amortization_je_template && (
              <p>Per-period JE: Dr Expense {fmtCents(detail.period_amount_cents)} / Cr Prepaid {fmtCents(detail.period_amount_cents)}</p>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1 rounded border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["#","Period Date","Amount","Remaining","Posted","JE"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {detail.schedule.map((row) => (
                <tr key={row.id} className={row.posted ? "bg-emerald-50" : "hover:bg-gray-50"}>
                  <td className="px-3 py-1.5 text-gray-500">{row.period_number}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(row.period_date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(row.amount_cents)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtCents(row.remaining_balance_cents)}</td>
                  <td className="px-3 py-1.5">
                    {row.posted
                      ? <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Posted</span>
                      : <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Pending</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-400">
                    {row.posted_journal_entry_id ? row.posted_journal_entry_id.slice(0, 8) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    description: "", asset_number: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    start_date: new Date().toISOString().slice(0, 10),
    periods: "12", total_amount_dollars: null as number | null,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createPrepaidExpense({
      operating_company_id: companyId,
      description: form.description.trim(),
      asset_number: form.asset_number.trim() || undefined,
      purchase_date: form.purchase_date,
      start_date: form.start_date,
      periods: Number(form.periods),
      total_amount_cents: Math.round((form.total_amount_dollars ?? 0) * 100),
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to create."),
  });

  const valid = form.description.trim() && form.purchase_date && form.start_date
    && Number(form.periods) > 0 && (form.total_amount_dollars ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">New Prepaid Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {error && <p className="text-sm text-red-600 mb-3 rounded bg-red-50 px-3 py-2">{error}</p>}
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Description *</label>
            <input className="w-full rounded border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Annual insurance premium" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Asset Number</label>
            <input className="w-full rounded border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={form.asset_number} onChange={(e) => setForm({ ...form, asset_number: e.target.value })} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Purchase Date *</label>
              <input type="date" className="w-full rounded border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Amortization Start *</label>
              <input type="date" className="w-full rounded border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Total Amount ($) *</label>
              <MoneyInput
                valueDollars={form.total_amount_dollars}
                onChangeDollars={(v) => setForm({ ...form, total_amount_dollars: v })}
                className="w-full"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">Periods (months) *</label>
              <input type="number" min="1" max="360"
                className="w-full rounded border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={form.periods} onChange={(e) => setForm({ ...form, periods: e.target.value })} />
            </div>
          </div>
          {(form.total_amount_dollars ?? 0) > 0 && Number(form.periods) > 0 && (
            <p className="text-xs text-gray-500 rounded bg-gray-50 px-2 py-1">
              Monthly: {fmtCents(Math.floor((form.total_amount_dollars ?? 0) * 100 / Number(form.periods)))} (GL posting GATED — flag OFF)
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {mutation.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrepaidExpensesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["prepaid-expenses", operatingCompanyId, statusFilter, offset],
    queryFn: () => getPrepaidExpenses({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["prepaid-expense-detail", detailId, operatingCompanyId],
    queryFn: () => getPrepaidExpenseDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <AccountingSubNavWrapper title="Prepaid Expenses" subtitle="Prepaid assets and amortization schedules">
      {showCreate && (
        <CreateModal companyId={operatingCompanyId} onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["prepaid-expenses", operatingCompanyId] })} />
      )}
      {detailId && detail && !detailLoading && (
        <SchedulePanel detail={detail} onClose={() => setDetailId(null)} />
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="fully_amortized">Fully Amortized</option>
          <option value="voided">Voided</option>
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString()} asset{total !== 1 ? "s" : ""}</span>
        <div className="ml-auto">
          <button onClick={() => setShowCreate(true)}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
            + New Prepaid
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load prepaid expenses.</p>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No prepaid expenses found.</p>
          <p className="text-xs text-gray-400 mt-1">Create a prepaid asset to track insurance, subscriptions, and other prepaid costs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["#","Description","Purchase Date","Periods","Total","Amortized","Remaining","Pending","Status","Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((row: PrepaidAssetListItem) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{row.asset_number ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate font-medium">
                    <button onClick={() => setDetailId(row.id)} className="text-slate-700 hover:underline text-left">{row.description}</button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(row.purchase_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-600">{row.periods}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtCents(row.total_amount_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-emerald-700">{fmtCents(row.amortized_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-gray-500">{fmtCents(row.total_amount_cents - row.amortized_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-500">{row.pending_periods}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {row.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => setDetailId(row.id)} className="text-xs text-slate-700 hover:underline">Schedule</button>
                  </td>
                </tr>
              ))}
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

export default PrepaidExpensesPage;
