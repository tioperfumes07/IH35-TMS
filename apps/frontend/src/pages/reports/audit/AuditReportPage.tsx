import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { fetchAuditReport, type AuditReportParams, type AuditReportRow } from "../../../api/auditReports";

const PAGE_SIZE = 100;

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function rowsToCsv(rows: AuditReportRow[], title: string): string {
  const headers = ["occurred_at", "event_type", "subject_type", "subject_id", "actor_email", "source"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      JSON.stringify(r.occurred_at ?? ""),
      JSON.stringify(r.event_type ?? ""),
      JSON.stringify(r.subject_type ?? ""),
      JSON.stringify(r.subject_id ?? ""),
      JSON.stringify(r.actor_email ?? ""),
      JSON.stringify(r.source ?? ""),
    ].join(","));
  }
  return `# ${title}\n` + lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface AuditReportPageProps {
  title: string;
  subtitle: string;
  endpoint: string;
  extraParams?: Partial<AuditReportParams>;
  showModuleFilter?: boolean;
  showDriverFilter?: boolean;
}

export function AuditReportPage({ title, subtitle, endpoint, extraParams, showModuleFilter, showDriverFilter }: AuditReportPageProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const params: AuditReportParams = {
    operating_company_id: companyId,
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to   ? { to:   new Date(to).toISOString()   } : {}),
    ...(showModuleFilter && moduleFilter ? { module: moduleFilter } : {}),
    ...(showDriverFilter && driverFilter ? { driver_id: driverFilter } : {}),
    ...extraParams,
    limit: PAGE_SIZE,
    offset,
  };

  const query = useQuery({
    queryKey: ["audit-report", endpoint, params],
    queryFn: () => fetchAuditReport(endpoint, params),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  function handleCsvExport() {
    if (rows.length === 0) return;
    downloadCsv(rowsToCsv(rows, title), `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.csv`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <PageHeader title={title} subtitle={subtitle} />
        <Button size="sm" variant="secondary" onClick={handleCsvExport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">From</label>
          <DatePicker value={from} onChange={(next) => { setFrom(next); setOffset(0); }}
            className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">To</label>
          <DatePicker value={to} onChange={(next) => { setTo(next); setOffset(0); }}
            className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        {showModuleFilter && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Module</label>
            <input type="text" value={moduleFilter} placeholder="e.g. dispatch"
              onChange={(e) => { setModuleFilter(e.target.value); setOffset(0); }}
              className="rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
        )}
        {showDriverFilter && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Driver ID</label>
            <input type="text" value={driverFilter} placeholder="UUID"
              onChange={(e) => { setDriverFilter(e.target.value); setOffset(0); }}
              className="rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
        )}
      </div>

      {query.isLoading && <div className="py-8 text-center text-sm text-gray-400">Loading…</div>}
      {query.isError && <div className="py-4 text-center text-sm text-red-500">Failed to load report.</div>}

      {!query.isLoading && !query.isError && (
        <>
          <div className="text-xs text-gray-400">{totalCount} record{totalCount !== 1 ? "s" : ""}</div>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {["Date/Time", "Event Type", "Subject", "Actor", "Source"].map((h) => (
                    <th key={h} className="border-b border-gray-200 px-3 py-2 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No records for the selected filters.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDate(r.occurred_at)}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{r.event_type}</td>
                    <td className="px-3 py-2 text-gray-500">{r.subject_type ?? "—"}{r.subject_id ? ` · ${r.subject_id.slice(0, 8)}…` : ""}</td>
                    <td className="px-3 py-2 text-gray-500">{r.actor_email ?? r.actor_user_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-400">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</Button>
              <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="secondary" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
