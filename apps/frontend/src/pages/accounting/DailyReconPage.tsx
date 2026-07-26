import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { fetchDailyRecon, type DailyReconMatchStatus, type DailyReconRow } from "../../api/daily-recon";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { DatePicker } from "../../components/forms/DatePicker";
import { CollapsedListFilters } from "../../components/table";
import { companyToday, addDaysIso } from "../../lib/businessDate";

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
  { value: "matched", label: "Matched" },
  { value: "missing_in_qbo", label: "Missing in QBO" },
  { value: "amount_mismatch", label: "Amount Mismatch" },
  { value: "missing_in_tms", label: "Missing in TMS" },
];

const STATUS_BADGES: Record<DailyReconMatchStatus, { label: string; cls: string }> = {
  matched:         { label: "Matched",           cls: "bg-slate-100 text-slate-700" },
  missing_in_qbo:  { label: "Missing in QBO",    cls: "bg-slate-100 text-slate-700" },
  amount_mismatch: { label: "Amount Mismatch",   cls: "bg-red-100 text-red-800" },
  missing_in_tms:  { label: "Missing in TMS",    cls: "bg-orange-100 text-orange-800" },
};

function formatCents(cents: number | null): string {
  if (cents == null) return "—";
  return formatUsdCents(cents);
}

function entityLabel(type: string): string {
  return ENTITY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

// Per-day reconciliation table columns for the shared ParityTable (replaces the hand-rolled
// per-day markup — B21/TBL-STANDARD). Every day-group renders its own ParityTable instance so
// the existing day-header rollup ("All reconciled" / "N item(s) need attention") is preserved.
const RECON_COLUMNS: Array<ParityColumn<DailyReconRow>> = [
  { key: "entity_type", label: "Type", render: (row) => <span className="whitespace-nowrap text-gray-500">{entityLabel(row.entity_type)}</span> },
  {
    key: "entity_id",
    label: "ID",
    render: (row) =>
      row.tms_detail_path ? (
        <Link to={row.tms_detail_path} className="font-mono text-[10px] text-slate-600 hover:underline">
          {row.entity_id.slice(0, 8)}…
        </Link>
      ) : (
        <span className="font-mono text-[10px] text-gray-500">{row.entity_id.slice(0, 8)}…</span>
      ),
  },
  { key: "tms_amount_cents", label: "TMS Amount", render: (row) => <span className="text-gray-700">{formatCents(row.tms_amount_cents)}</span> },
  { key: "tms_memo", label: "Memo", cellClass: "truncate max-w-[180px]", render: (row) => <span className="text-gray-500">{row.tms_memo ?? "—"}</span> },
  {
    key: "match_status",
    label: "Status",
    render: (row) => {
      const badge = STATUS_BADGES[row.match_status];
      return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      );
    },
  },
  { key: "qbo_id", label: "QBO ID", render: (row) => <span className="font-mono text-[10px] text-gray-500">{row.qbo_id ?? "—"}</span> },
  {
    key: "qbo_amount_cents",
    label: "QBO Amount",
    render: (row) => {
      const amountMismatch =
        row.tms_amount_cents != null && row.qbo_amount_cents != null && row.tms_amount_cents !== row.qbo_amount_cents;
      return <span className={amountMismatch ? "font-semibold text-red-700" : "text-gray-700"}>{formatCents(row.qbo_amount_cents)}</span>;
    },
  },
  { key: "qbo_error", label: "Error", cellClass: "truncate max-w-[160px]", render: (row) => <span className="text-[10px] text-red-600">{row.qbo_error ?? ""}</span> },
];

export function DailyReconPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const today = companyToday();
  const thirtyDaysAgo = addDaysIso(today, -30);

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
  const listState = useListState(query, (data?.days.length ?? 0) === 0);

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
            <p className={`mt-0.5 inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</p>
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
        <p className="text-sm text-slate-700">Select an operating company.</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">Failed to load reconciliation data.</p>
      ) : !data?.gl_posting_active ? (
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="font-semibold text-slate-700">TMS posting not enabled — nothing to reconcile yet.</p>
          <p className="mt-1 text-sm text-slate-600">
            The GL_POSTING_ENABLED feature flag is off for this entity. Once posting is live, daily TMS
            journal entries will appear here paired against QBO sync queue results.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <CollapsedListFilters
            activeFilterCount={(fromDate || toDate ? 1 : 0) + (entityType ? 1 : 0) + (matchStatus !== "all" ? 1 : 0)}
            testIdPrefix="daily-recon"
            dataAttributes={{ "data-daily-recon-filter-toolbar": "collapsed" }}
          >
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-semibold uppercase text-gray-500">From</label>
                <DatePicker
                  value={fromDate}
                  onChange={setFromDate}
                  className="h-10 rounded-sm border border-gray-300 px-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-semibold uppercase text-gray-500">To</label>
                <DatePicker
                  value={toDate}
                  onChange={setToDate}
                  className="h-10 rounded-sm border border-gray-300 px-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-semibold uppercase text-gray-500">Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="h-10 rounded-sm border border-gray-300 px-2 text-sm"
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
                  className="h-10 rounded-sm border border-gray-300 px-2 text-sm"
                >
                  {MATCH_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </CollapsedListFilters>

          {/* Days */}
          {listState.isEmpty ? (
            <div className="rounded-sm border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              No transactions found for the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              {data.days.map((day) => (
                <div key={day.date} className="overflow-hidden rounded-sm border border-gray-200 bg-white">
                  {/* Day header */}
                  <div className={`flex items-center justify-between px-4 py-2 ${
                    day.all_reconciled
                      ? "bg-slate-50 border-b border-slate-200"
                      : "bg-gray-50 border-b border-gray-200"
                  }`}>
                    <span className="font-semibold text-sm text-gray-900">{formatDateUS(day.date)}</span>
                    {day.all_reconciled ? (
                      <span className="text-xs font-semibold text-slate-600">All reconciled</span>
                    ) : (
                      <span className="text-xs text-slate-600">
                        {day.rows.filter((r) => r.match_status !== "matched").length} item(s) need attention
                      </span>
                    )}
                  </div>

                  {/* Rows table */}
                  <ParityTable
                    columns={RECON_COLUMNS}
                    rows={day.rows}
                    rowKey={(row) => `${row.entity_type}-${row.entity_id}`}
                    loading={false}
                    density="compact"
                    storageKey="daily-recon-rows"
                    stickyHeader={false}
                  />
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
