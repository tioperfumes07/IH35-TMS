import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { fetchDailyRecon, type DailyReconMatchStatus, type DailyReconRow } from "../../api/daily-recon";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "invoice", label: "Invoice" },
  { value: "bill", label: "Bill" },
  { value: "bill_payment", label: "Bill Payment" },
  { value: "payment", label: "Payment" },
  { value: "journal_entry", label: "Journal Entry" },
  { value: "expense", label: "Expense" },
  { value: "factoring_advance", label: "Factoring Advance" },
];

const MATCH_STATUS_OPTIONS: Array<{ value: DailyReconMatchStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "matched", label: "Matched ✓" },
  { value: "missing_in_qbo", label: "Missing in QBO" },
  { value: "amount_mismatch", label: "Amount Mismatch" },
  { value: "missing_in_tms", label: "Missing in TMS" },
];

const STATUS_BADGES: Record<DailyReconMatchStatus, { label: string; cls: string }> = {
  matched:         { label: "Matched ✓",         cls: "bg-emerald-100 text-emerald-800" },
  missing_in_qbo:  { label: "Missing in QBO",    cls: "bg-amber-100 text-amber-800" },
  amount_mismatch: { label: "Amount Mismatch",   cls: "bg-red-100 text-red-800" },
  missing_in_tms:  { label: "Missing in TMS",    cls: "bg-orange-100 text-orange-800" },
};

function formatCents(cents: number | null): string {
  if (cents == null) return "—";
  return money.format(cents / 100);
}

function entityLabel(type: string): string {
  return ENTITY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function ReconRow({ row }: { row: DailyReconRow }) {
  const badge = STATUS_BADGES[row.match_status];
  const amountMatch =
    row.tms_amount_cents != null &&
    row.qbo_amount_cents != null &&
    row.tms_amount_cents !== row.qbo_amount_cents;

  return (
    <tr className="border-b border-gray-100 text-xs hover:bg-gray-50">
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{entityLabel(row.entity_type)}</td>
      <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">
        {row.tms_detail_path ? (
          <Link to={row.tms_detail_path} className="text-slate-600 hover:underline">
            {row.entity_id.slice(0, 8)}…
          </Link>
        ) : (
          <span>{row.entity_id.slice(0, 8)}…</span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-700">{formatCents(row.tms_amount_cents)}</td>
      <td className="px-3 py-2 text-gray-500 truncate max-w-[180px]">{row.tms_memo ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{row.qbo_id ?? "—"}</td>
      <td className={`px-3 py-2 ${amountMatch ? "text-red-700 font-semibold" : "text-gray-700"}`}>
        {formatCents(row.qbo_amount_cents)}
      </td>
      <td className="px-3 py-2 text-red-600 text-[10px] truncate max-w-[160px]">{row.qbo_error ?? ""}</td>
    </tr>
  );
}

export function DailyReconPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [entityType, setEntityType] = useState("");
  const [matchStatus, setMatchStatus] = useState<DailyReconMatchStatus | "all">("all");

  const query = useQuery({
    queryKey: ["daily-recon", companyId, fromDate, toDate, entityType, matchStatus],
    queryFn: () =>
      fetchDailyRecon({
        operating_company_id: companyId,
        from_date: fromDate,
        to_date: toDate,
        entity_type: entityType || undefined,
        match_status: matchStatus,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const data = query.data;

  const kpiStrip = data?.gl_posting_active ? (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(["matched", "missing_in_qbo", "amount_mismatch", "missing_in_tms"] as DailyReconMatchStatus[]).map((s) => {
        const count = data.days.flatMap((d) => d.rows).filter((r) => r.match_status === s).length;
        const b = STATUS_BADGES[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => setMatchStatus(matchStatus === s ? "all" : s)}
            className={`rounded border px-3 py-2 text-left text-xs transition-colors ${
              matchStatus === s ? "border-slate-400 bg-slate-100" : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <p className="font-semibold text-gray-900">{count}</p>
            <p className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</p>
          </button>
        );
      })}
    </div>
  ) : undefined;

  return (
    <AccountingSubNavWrapper
      title="Daily TMS↔QBO Reconciliation"
      subtitle="Per-day parity view — TMS GL vs QBO actuals. Read-only."
      kpiStrip={kpiStrip}
    >
      {!companyId ? (
        <p className="text-sm text-amber-800">Select an operating company.</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">Failed to load reconciliation data.</p>
      ) : !data?.gl_posting_active ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <p className="font-semibold text-amber-800">TMS posting not enabled — nothing to reconcile yet.</p>
          <p className="mt-1 text-sm text-amber-700">
            The GL_POSTING_ENABLED feature flag is off for this entity. Once posting is live, daily TMS
            journal entries will appear here paired against QBO sync queue results.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold uppercase text-gray-500">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 rounded border border-gray-300 px-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold uppercase text-gray-500">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 rounded border border-gray-300 px-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold uppercase text-gray-500">Type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="h-10 rounded border border-gray-300 px-2 text-sm"
              >
                {ENTITY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold uppercase text-gray-500">Status</label>
              <select
                value={matchStatus}
                onChange={(e) => setMatchStatus(e.target.value as DailyReconMatchStatus | "all")}
                className="h-10 rounded border border-gray-300 px-2 text-sm"
              >
                {MATCH_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Days */}
          {data.days.length === 0 ? (
            <div className="rounded border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              No transactions found for the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              {data.days.map((day) => (
                <div key={day.date} className="overflow-hidden rounded border border-gray-200 bg-white">
                  {/* Day header */}
                  <div className={`flex items-center justify-between px-4 py-2 ${
                    day.all_reconciled
                      ? "bg-emerald-50 border-b border-emerald-200"
                      : "bg-gray-50 border-b border-gray-200"
                  }`}>
                    <span className="font-semibold text-sm text-gray-900">{day.date}</span>
                    {day.all_reconciled ? (
                      <span className="text-xs font-semibold text-emerald-700">All reconciled ✓</span>
                    ) : (
                      <span className="text-xs text-amber-700">
                        {day.rows.filter((r) => r.match_status !== "matched").length} item(s) need attention
                      </span>
                    )}
                  </div>

                  {/* Rows table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">ID</th>
                          <th className="px-3 py-2 text-left">TMS Amount</th>
                          <th className="px-3 py-2 text-left">Memo</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">QBO ID</th>
                          <th className="px-3 py-2 text-left">QBO Amount</th>
                          <th className="px-3 py-2 text-left">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.rows.map((row) => (
                          <ReconRow key={`${row.entity_type}-${row.entity_id}`} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            {data.total} total row(s) · {data.from_date} → {data.to_date} · Read-only — this screen detects drift, never repairs it.
          </p>
        </>
      )}
    </AccountingSubNavWrapper>
  );
}
