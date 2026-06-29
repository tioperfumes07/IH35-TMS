import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import {
  getFixedAssets, getFixedAssetDetail,
  type FixedAssetListItem, type FixedAssetDetail,
} from "../../api/fixed-assets";

const fmtCents = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
const titleize = (s: string) => s.replace(/_/g, " ");

const STATUS_COLOR: Record<string, string> = {
  active: "bg-slate-100 text-slate-700",
  fully_depreciated: "bg-emerald-100 text-emerald-800",
  disposed: "bg-amber-100 text-amber-800",
  voided: "bg-red-100 text-red-700",
};

function DetailPanel({ detail, onClose }: { detail: FixedAssetDetail; onClose: () => void }) {
  const cost = detail.purchase_price_cents;
  const pct = cost > 0 ? Math.round((detail.depreciation_to_date_cents / Math.max(1, cost - detail.salvage_value_cents)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{detail.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {detail.asset_number ? `#${detail.asset_number} · ` : ""}{detail.class_name ?? "—"} · {titleize(detail.method)} · {detail.useful_life_months} mo · {titleize(detail.convention)}
            </p>
            {!detail.is_owner_operated && detail.owner_company_name && (
              <p className="text-xs text-amber-700 mt-0.5">Owned by {detail.owner_company_name} (operated here)</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
          <div><div className="text-xs text-gray-500">Cost</div><div className="tabular-nums">{fmtCents(detail.purchase_price_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Salvage</div><div className="tabular-nums">{fmtCents(detail.salvage_value_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Depr. to date</div><div className="tabular-nums text-emerald-700">{fmtCents(detail.depreciation_to_date_cents)}</div></div>
          <div><div className="text-xs text-gray-500">Net book value</div><div className="tabular-nums font-semibold">{fmtCents(detail.net_book_value_cents)}</div></div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Depreciated</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>

        {detail.disposal && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold mb-1">Disposed {fmtDate(detail.disposal.disposal_date)} ({titleize(detail.disposal.disposal_type)})</p>
            <p>Proceeds {fmtCents(detail.disposal.proceeds_cents)} · Book value {fmtCents(detail.disposal.book_value_at_disposal_cents)} · {detail.disposal.gain_loss_cents >= 0 ? "Gain" : "Loss"} {fmtCents(Math.abs(detail.disposal.gain_loss_cents))}</p>
          </div>
        )}

        {detail.je_preview.depreciation_je_template && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold mb-1">GL Posting Preview (GATED — autopost flag OFF)</p>
            <p>Per-period JE: Dr Depreciation Expense / Cr Accumulated Depreciation</p>
          </div>
        )}

        {detail.schedule_note && (
          <p className="mb-3 text-xs text-gray-500 rounded bg-gray-50 px-2 py-1">{detail.schedule_note}</p>
        )}

        <div className="overflow-y-auto flex-1 rounded border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {["#", "Period", "Depreciation", "Accumulated", "Book Value"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {detail.schedule.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No schedule to display.</td></tr>
              ) : detail.schedule.map((row) => (
                <tr key={row.period_number} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-500">{row.period_number}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(row.period_date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(row.depreciation_amount_cents)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtCents(row.accumulated_to_date_cents)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtCents(row.book_value_end_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function FixedAssetsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag("FIXED_ASSETS_ENABLED", operatingCompanyId || undefined);
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["fixed-assets", operatingCompanyId, statusFilter, offset],
    queryFn: () => getFixedAssets({ operating_company_id: operatingCompanyId, status: statusFilter || undefined, limit, offset }),
    enabled: Boolean(selectedCompanyId) && enabled,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["fixed-asset-detail", detailId, operatingCompanyId],
    queryFn: () => getFixedAssetDetail(detailId!, operatingCompanyId),
    enabled: Boolean(detailId && operatingCompanyId) && enabled,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="Fixed Assets" subtitle="Fixed asset register and depreciation schedules">
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Fixed asset tracking is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the FIXED_ASSETS_ENABLED feature flag to use this module.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Fixed Assets" subtitle="Asset register, depreciation schedule, and disposals (read-only; GL posting gated)">
      {detailId && detail && !detailLoading && (
        <DetailPanel detail={detail} onClose={() => setDetailId(null)} />
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="fully_depreciated">Fully Depreciated</option>
          <option value="disposed">Disposed</option>
          <option value="voided">Voided</option>
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString()} asset{total !== 1 ? "s" : ""}</span>
      </div>

      {isLoading || flagLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600 py-8 text-center">Failed to load fixed assets.</p>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No fixed assets found.</p>
          <p className="text-xs text-gray-400 mt-1">Assets will appear here once they are added to the register.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Name", "Class", "In Service", "Method", "Cost", "Depr. to date", "Net Book Value", "Owner", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((row: FixedAssetListItem) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{row.asset_number ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate font-medium">
                    <button onClick={() => setDetailId(row.id)} className="text-slate-700 hover:underline text-left">{row.name}</button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.class_name ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(row.in_service_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 capitalize">{titleize(row.method)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtCents(row.purchase_price_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-emerald-700">{fmtCents(row.depreciation_to_date_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-semibold">{fmtCents(row.net_book_value_cents)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {row.is_owner_operated ? "Self" : (row.owner_company_name ?? "Leased-in")}
                  </td>
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

export default FixedAssetsPage;
