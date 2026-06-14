import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getInboxReporting, type InboxReportingData } from "../../api/driverInboxReporting";

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
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#1A1F36]">{value}</div>
    </div>
  );
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
  const inputCls = "min-h-11 rounded border border-gray-300 px-2 text-sm";

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
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <div className="space-y-1">
          <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">From</label>
          <input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="block text-[9px] font-semibold uppercase tracking-wide text-[#8A92AB]">To</label>
          <input type="date" className={inputCls} value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Link to="/driver-hub" className="ml-auto text-xs font-semibold text-blue-700 underline">
          ← Back to Driver Inbox
        </Link>
      </div>

      {!companyId ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Select a company to view reporting.</div>
      ) : query.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading…</div>
      ) : query.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load reporting.</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Card label="Total requests" value={String(data.summary.total_requests)} />
            <Card label="Approved" value={String(data.summary.approved)} />
            <Card label="Denied" value={String(data.summary.denied)} />
            <Card label="Approval rate" value={fmtPct(data.summary.approval_rate_pct)} />
            <Card label="Avg time-to-view" value={fmtSeconds(data.summary.avg_time_to_view_seconds)} />
            <Card label="Avg time-to-approve" value={fmtSeconds(data.summary.avg_time_to_approve_seconds)} />
            <Card label="Approved volume" value={fmtCents(data.summary.total_approved_advance_cents)} />
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[#6B7280]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Driver</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Approved</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Denied</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Approval %</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Time-to-view</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Time-to-approve</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Approved volume</th>
                </tr>
              </thead>
              <tbody>
                {data.by_driver.length === 0 ? (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-gray-500">No requests in this period.</td></tr>
                ) : (
                  data.by_driver.map((r) => (
                    <tr key={r.driver_id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-left text-[#1A1F36]">{r.driver_name}</td>
                      <td className="px-2 py-1.5 text-right">{r.total_requests}</td>
                      <td className="px-2 py-1.5 text-right text-[#16A34A]">{r.approved}</td>
                      <td className="px-2 py-1.5 text-right">{r.denied}</td>
                      <td className="px-2 py-1.5 text-right">{fmtPct(r.approval_rate_pct)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtSeconds(r.avg_time_to_view_seconds)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtSeconds(r.avg_time_to_approve_seconds)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtCents(r.approved_advance_cents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data.not_computed.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
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
