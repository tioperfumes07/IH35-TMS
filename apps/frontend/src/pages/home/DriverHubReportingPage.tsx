import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  getInboxReporting,
  type InboxReportingData,
  type InboxReportingDriverRow,
} from "../../api/driverInboxReporting";
import { formatUsdCents } from "../../lib/money";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
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
    render: (r) => <span className="text-[#1f2a44]">{r.driver_name}</span>,
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

export function DriverHubReportingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [from, setFrom] = useState(isoDaysAgo(28));
  const [to, setTo] = useState(todayIso());

  const query = useQuery({
    queryKey: ["driver-inbox-reporting", companyId, from, to],
    queryFn: () => getInboxReporting({ operating_company_id: companyId, from, to }),
    enabled: Boolean(companyId) && Boolean(from) && Boolean(to),
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

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <div className="space-y-1">
          <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">From</label>
          <DatePicker className={inputCls} value={from} max={to} onChange={setFrom} />
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">To</label>
          <DatePicker className={inputCls} value={to} min={from} max={todayIso()} onChange={setTo} />
        </div>
        <Link to="/driver-hub" className="ml-auto text-xs font-semibold text-slate-700 underline">
          ← Back to Driver Inbox
        </Link>
      </div>

      {!companyId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Select a company to view reporting.</div>
      ) : query.isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading…</div>
      ) : query.isError ? (
        <ListErrorState
          title="Could not load reporting."
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
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
    </div>
  );
}

export default DriverHubReportingPage;
