import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  getInboxReporting,
  type InboxReportingData,
  type InboxReportingDriverRow,
  type InboxReportingLoadRow,
} from "../../api/driverInboxReporting";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
import { addDaysIso, companyToday } from "../../lib/businessDate";

function isoDaysAgo(days: number): string {
  return addDaysIso(companyToday(), -days);
}
function todayIso(): string {
  return companyToday();
}
function fmtSeconds(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}
function fmtCents(c: number): string {
  return formatUsdCents(c);
}
function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

// C8: `to` is REQUIRED — every advance-request rollup opens the request list it counted.
function Card({ label, value, to }: { label: string; value: string; to: string }) {
  return <DrillKpiCard size="md" label={label} value={value} to={to} />;
}

function exportCsv(data: InboxReportingData) {
  const header = [
    "Driver",
    "Total",
    "Approved",
    "Denied",
    "Approval %",
    "Avg time-to-view (s)",
    "Avg time-to-approve (s)",
    "Approved volume ($)",
  ];
  const lines = data.by_driver.map((r) =>
    [
      JSON.stringify(r.driver_name),
      r.total_requests,
      r.approved,
      r.denied,
      r.approval_rate_pct ?? "",
      r.avg_time_to_view_seconds ?? "",
      r.avg_time_to_approve_seconds ?? "",
      (r.approved_advance_cents / 100).toFixed(2),
    ].join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `driver-inbox-reporting-${data.from}_to_${data.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const DRIVER_REPORTING_COLUMNS: Array<ParityColumn<InboxReportingDriverRow>> = [
  {
    key: "driver_name",
    label: "Driver",
    sortable: true,
    render: (r) => (
      <EntityLink kind="driver" id={r.driver_id} label={entityLabel(r.driver_name, r.driver_id, "Driver")} />
    ),
  },
  {
    key: "total_requests",
    label: "Total",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => r.total_requests,
  },
  {
    key: "approved",
    label: "Approved",
    sortable: true,
    className: "text-right",
    cellClass: "text-right text-[#334155]",
    render: (r) => r.approved,
  },
  {
    key: "denied",
    label: "Denied",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => r.denied,
  },
  {
    key: "approval_rate_pct",
    label: "Approval %",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => fmtPct(r.approval_rate_pct),
  },
  {
    key: "avg_time_to_view_seconds",
    label: "Time-to-view",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => fmtSeconds(r.avg_time_to_view_seconds),
  },
  {
    key: "avg_time_to_approve_seconds",
    label: "Time-to-approve",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => fmtSeconds(r.avg_time_to_approve_seconds),
  },
  {
    key: "approved_advance_cents",
    label: "Approved volume",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => fmtCents(r.approved_advance_cents),
  },
];

// LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK — per-trip advance volume, only rows with a real
// load link (see api/driverInboxReporting.ts's InboxReportingLoadRow).
const LOAD_REPORTING_COLUMNS: Array<ParityColumn<InboxReportingLoadRow>> = [
  {
    key: "load_number",
    label: "Load",
    sortable: true,
    render: (r) => <EntityLink kind="load" id={r.load_id} label={entityLabel(r.load_number, r.load_id, "Load")} />,
  },
  {
    key: "total_requests",
    label: "Total",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => r.total_requests,
  },
  {
    key: "approved",
    label: "Approved",
    sortable: true,
    className: "text-right",
    cellClass: "text-right text-[#334155]",
    render: (r) => r.approved,
  },
  {
    key: "approved_advance_cents",
    label: "Approved volume",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (r) => fmtCents(r.approved_advance_cents),
  },
];

export function DriverHubReportingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaultRange = { from: isoDaysAgo(28), to: todayIso() };
  const [range, setRange] = useState(defaultRange);
  const stagedRange = useStagedListFilters({
    applied: range,
    empty: defaultRange,
    onApply: setRange,
  });

  const query = useQuery({
    queryKey: ["driver-inbox-reporting", companyId, range.from, range.to],
    queryFn: () => getInboxReporting({ operating_company_id: companyId, from: range.from, to: range.to }),
    enabled: Boolean(companyId) && Boolean(range.from) && Boolean(range.to),
  });
  const data = query.data;
  const inputCls = "min-h-11 rounded-sm border border-gray-300 px-2 text-sm";

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/driver-hub"
        title="Driver Inbox — Reporting"
        subtitle="Request accountability (read-only)"
        actions={
          <button
            type="button"
            disabled={!data || data.by_driver.length === 0}
            onClick={() => data && exportCsv(data)}
            className="rounded-sm border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
        }
      />

      {!companyId ? (
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
          data-testid="driver-hub-reporting-need-company"
        >
          Select an operating company to view driver inbox reporting.
        </div>
      ) : (
        <>
      <div className="flex justify-end rounded-sm border border-gray-200 bg-white p-3">
        <Link to="/driver-hub" className="text-xs font-semibold text-slate-700 underline">
          ← Back to Driver Inbox
        </Link>
      </div>

      {query.isError ? (
        <ListErrorBanner onRetry={() => void query.refetch()} />
      ) : null}
      {query.isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading…</div>
      ) : query.isError ? (
        <ListErrorState
          title="Could not load reporting."
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : data && data.by_driver.length === 0 ? (
        <div
          className="rounded-sm border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400"
          data-testid="driver-hub-reporting-honest-empty"
        >
          No requests in this period.
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Card label="Total requests" value={String(data.summary.total_requests)} to="/driver-finance/cash-advance-requests" />
            <Card label="Approved" value={String(data.summary.approved)} to="/driver-finance/cash-advance-requests" />
            <Card label="Denied" value={String(data.summary.denied)} to="/driver-finance/cash-advance-requests" />
            <Card label="Approval rate" value={fmtPct(data.summary.approval_rate_pct)} to="/driver-finance/cash-advance-requests" />
            <Card label="Avg time-to-view" value={fmtSeconds(data.summary.avg_time_to_view_seconds)} to="/driver-finance/cash-advance-requests" />
            <Card label="Avg time-to-approve" value={fmtSeconds(data.summary.avg_time_to_approve_seconds)} to="/driver-finance/cash-advance-requests" />
            <Card label="Approved volume" value={fmtCents(data.summary.total_approved_advance_cents)} to="/cash-advances" />
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-2">
            <ParityTable
              rows={data.by_driver}
              columns={DRIVER_REPORTING_COLUMNS}
              rowKey={(r) => r.driver_id}
              storageKey="driver-hub-reporting-by-driver"
              emptyText="No requests in this period."
              tableTestId="driver-hub-reporting-table"
              rowTestId={(r) => `driver-hub-reporting-row-${r.driver_id}`}
              initialPageSize={50}
              filterBar={
                <CollapsedListFilters
                  activeFilterCount={range.from !== defaultRange.from || range.to !== defaultRange.to ? 1 : 0}
                  onApply={stagedRange.apply}
                  onReset={stagedRange.reset}
                  onCancel={stagedRange.cancel}
                  applyDisabled={!stagedRange.dirty}
                  testIdPrefix="driver-hub-reporting"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">From</label>
                      <DatePicker
                        className={inputCls}
                        value={stagedRange.draft.from}
                        max={stagedRange.draft.to}
                        onChange={(from) => stagedRange.setDraft((draft) => ({ ...draft, from }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">To</label>
                      <DatePicker
                        className={inputCls}
                        value={stagedRange.draft.to}
                        min={stagedRange.draft.from}
                        max={todayIso()}
                        onChange={(to) => stagedRange.setDraft((draft) => ({ ...draft, to }))}
                      />
                    </div>
                  </div>
                </CollapsedListFilters>
              }
            />
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-2">
            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#8A92AB]">
              By load
            </div>
            <ParityTable
              rows={data.by_load}
              columns={LOAD_REPORTING_COLUMNS}
              rowKey={(r) => r.load_id}
              storageKey="driver-hub-reporting-by-load"
              emptyText="No load-linked requests in this period."
              tableTestId="driver-hub-reporting-by-load-table"
              rowTestId={(r) => `driver-hub-reporting-by-load-row-${r.load_id}`}
              initialPageSize={50}
            />
          </div>

          {data.not_computed.length > 0 ? (
            <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-[11px] text-slate-700">
              <span className="font-semibold">Not yet computed: </span>
              {data.not_computed.join(" ")}
            </div>
          ) : null}
        </>
      ) : null}
        </>
      )}
    </div>
  );
}

export default DriverHubReportingPage;
