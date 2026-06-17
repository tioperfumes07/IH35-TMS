import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";

type GroupBy = "driver" | "customer" | "lane";

type LateArrivalRow = {
  entity_id: string;
  entity_label: string;
  late_count: number;
  total_count: number;
  late_rate: number;
  chronic_offender: boolean;
};

type LateArrivalReport = {
  grace_minutes: number;
  from: string;
  to: string;
  group_by: GroupBy;
  rows: LateArrivalRow[];
};

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function fetchLateArrivalReport(companyId: string, from: string, to: string, by: GroupBy) {
  const q = new URLSearchParams({ operating_company_id: companyId, from, to, by });
  return apiRequest<LateArrivalReport>(`/api/v1/dispatch/analytics/late-arrivals?${q.toString()}`);
}

const TAB_LABELS: Record<GroupBy, string> = {
  driver: "By driver",
  customer: "By customer",
  lane: "By lane",
};

export function LateArrivalReport() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>("driver");
  const [applied, setApplied] = useState({ from: monthStart(), to: today(), groupBy: "driver" as GroupBy });

  const reportQuery = useQuery({
    queryKey: ["reports", "late-arrival", operatingCompanyId, applied.from, applied.to, applied.groupBy],
    queryFn: () => fetchLateArrivalReport(operatingCompanyId, applied.from, applied.to, applied.groupBy),
    enabled: Boolean(operatingCompanyId),
  });

  const summary = useMemo(() => {
    const rows = reportQuery.data?.rows ?? [];
    const chronic = rows.filter((row) => row.chronic_offender);
    return { total: rows.length, chronic: chronic.length };
  }, [reportQuery.data?.rows]);

  return (
    <div data-testid="late-arrival-report-page" className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        title="Late arrival analytics"
        subtitle="Completed stop late rates by driver, customer, and lane (30-minute grace)."
      />

      <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-600">
          From
          <DatePicker
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
            value={from}
            onChange={(next) => setFrom(next)}
          />
        </label>
        <label className="text-xs text-slate-600">
          To
          <DatePicker
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
            value={to}
            onChange={(next) => setTo(next)}
          />
        </label>
        <Button
          size="sm"
          onClick={() => setApplied({ from, to, groupBy })}
          disabled={!operatingCompanyId}
        >
          Apply
        </Button>
        <div className="ml-auto text-xs text-slate-500">
          {summary.chronic} chronic (&gt;20%) · {summary.total} entities
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(Object.keys(TAB_LABELS) as GroupBy[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-2 text-sm ${groupBy === tab ? "border-b-2 border-blue-600 font-medium text-blue-700" : "text-slate-600"}`}
            onClick={() => {
              setGroupBy(tab);
              setApplied((current) => ({ ...current, groupBy: tab }));
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{TAB_LABELS[applied.groupBy]}</th>
              <th className="px-3 py-2">Late</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Rate</th>
            </tr>
          </thead>
          <tbody>
            {(reportQuery.data?.rows ?? []).map((row) => (
              <tr
                key={row.entity_id}
                className={row.chronic_offender ? "bg-amber-50" : "border-t border-slate-100"}
              >
                <td className="px-3 py-2 font-medium text-slate-900">{row.entity_label}</td>
                <td className="px-3 py-2">{row.late_count}</td>
                <td className="px-3 py-2">{row.total_count}</td>
                <td className="px-3 py-2">{pct(row.late_rate)}</td>
              </tr>
            ))}
            {!reportQuery.isLoading && (reportQuery.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No completed stops with scheduled times in this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
