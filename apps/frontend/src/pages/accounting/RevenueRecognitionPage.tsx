import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import {
  getRevenueContracts, getRevenueContractDetail,
  type RevenueContractListItem, type RevenueContractDetail, type RevenueObligation,
} from "../../api/revenue-recognition";

const fmtCents = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-slate-100 text-slate-700",
  fully_recognized: "bg-emerald-100 text-emerald-800",
  voided: "bg-red-100 text-red-700",
};

function ObligationBlock({ ob }: { ob: RevenueObligation }) {
  return (
    <div className="rounded border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="text-sm font-medium text-gray-800">
          #{ob.obligation_number} · {ob.description}
          <span className="ml-2 text-xs text-gray-500">({titleize(ob.recognition_method)})</span>
        </div>
        <div className="text-xs text-gray-600">
          Allocated {fmtCents(ob.allocated_price_cents)} · Recognized <span className="text-emerald-700">{fmtCents(ob.recognized_to_date_cents)}</span> · Deferred {fmtCents(ob.remaining_deferred_cents)}
        </div>
      </div>
      {ob.schedule_note && <p className="px-3 py-2 text-xs text-gray-500">{ob.schedule_note}</p>}
      {ob.schedule.length > 0 && (
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-white">
            <tr>
              {["#", "Period", "Recognized", "Remaining Deferred"].map((h) => (
                <th key={h} className="px-3 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ob.schedule.map((r) => (
              <tr key={r.period_number} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-500">{r.period_number}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.period_date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(r.recognized_amount_cents)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtCents(r.remaining_deferred_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DetailPanel({ detail, onClose }: { detail: RevenueContractDetail; onClose: () => void }) {
  const pct = detail.transaction_price_cents > 0
    ? Math.round((detail.recognized_to_date_cents / detail.transaction_price_cents) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.description}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.contract_number ? `#${detail.contract_number} · ` : ""}{titleize(detail.source_type)} · {fmtDate(detail.contract_date)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
          <div><div className="text-xs text-gray-500">Transaction price</div><div className="tabular-nums">{fmtCents(detail.transaction_price_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Recognized to date</div><div className="tabular-nums text-emerald-700">{fmtCents(detail.recognized_to_date_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Deferred balance</div><div className="tabular-nums font-semibold">{fmtCents(detail.deferred_balance_cents)}</div></div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Recognized</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>

        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold mb-1">GL Posting (GATED — REVENUE_RECOGNITION_POST_ENABLED OFF)</p>
          <p>Deferral: Dr AR / Cr Deferred Revenue · Per-period: Dr Deferred Revenue / Cr Revenue</p>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3">
          {detail.obligations.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No performance obligations on this contract.</p>
          ) : detail.obligations.map((ob) => <ObligationBlock key={ob.id} ob={ob} />)}
        </div>
      </div>
    </div>
  );
}

export function RevenueRecognitionPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag("REVENUE_RECOGNITION_ENABLED", operatingCompanyId || undefined);
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["revenue-contracts", operatingCompanyId, statusFilter, offset],
    queryFn: () => getRevenueContracts({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId) && enabled,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["revenue-contract-detail", detailId, operatingCompanyId],
    queryFn: () => getRevenueContractDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId) && enabled,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="Revenue Recognition" subtitle="Deferred revenue schedules and recognition rules">
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Revenue recognition schedules are not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the REVENUE_RECOGNITION_ENABLED feature flag to use this module.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Revenue Recognition" subtitle="ASC 606 contracts, obligations, and recognition schedule (read-only; GL posting gated)">
      {detailId && detail && !detailLoading && (
        <DetailPanel detail={detail} onClose={() => setDetailId(null)} />
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="fully_recognized">Fully Recognized</option>
          <option value="voided">Voided</option>
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString()} contract{total !== 1 ? "s" : ""}</span>
      </div>

      {isLoading || flagLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load revenue contracts.</p>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No revenue contracts found.</p>
          <p className="text-xs text-gray-400 mt-1">Contracts will appear here once revenue recognition is in use.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Description", "Source", "Date", "Price", "Recognized", "Deferred", "Obligations", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((row: RevenueContractListItem) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{row.contract_number ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate font-medium">
                    <button onClick={() => setDetailId(row.id)} className="text-slate-700 hover:underline text-left">{row.description}</button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 capitalize">{titleize(row.source_type)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(row.contract_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtCents(row.transaction_price_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-emerald-700">{fmtCents(row.recognized_to_date_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmtCents(row.deferred_balance_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-600">{row.obligation_count}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {titleize(row.status)}
                    </span>
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

export default RevenueRecognitionPage;
