import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";

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
  return monthBoundsIso(companyToday()).start;
}

function today() {
  return companyToday();
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
  const emptyFilters = { from: monthStart(), to: today(), groupBy: "driver" as GroupBy };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({
    applied,
    empty: emptyFilters,
    onApply: setApplied,
  });

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

  const rows = reportQuery.data?.rows ?? [];

  const columns = useMemo<ParityColumn<LateArrivalRow>[]>(
    () => [
      { key: "entity_label", label: TAB_LABELS[applied.groupBy], sortable: true, render: (row) => <span className="font-medium text-slate-900">{row.entity_label}</span> },
      { key: "late_count", label: "Late", sortable: true },
      { key: "total_count", label: "Total", sortable: true },
      { key: "late_rate", label: "Rate", sortable: true, render: (row) => pct(row.late_rate) },
    ],
    [applied.groupBy],
  );

  return (
    <div data-testid="late-arrival-report-page" className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        title="Late arrival analytics"
        subtitle="Completed stop late rates by driver, customer, and lane (30-minute grace)."
        backHref="/reports"
        breadcrumb={["Reports", "Late Arrival Analytics"]}
      />

      <CollapsedListFilters
        activeFilterCount={JSON.stringify(applied) !== JSON.stringify(emptyFilters) ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-late-arrival"
        className="rounded-sm border border-slate-200 bg-white p-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            From
            <DatePicker className="mt-1 block" value={staged.draft.from} onChange={(next) => staged.setDraft((p) => ({ ...p, from: next }))} />
          </label>
          <label className="text-xs text-slate-600">
            To
            <DatePicker className="mt-1 block" value={staged.draft.to} onChange={(next) => staged.setDraft((p) => ({ ...p, to: next }))} />
          </label>
        </div>
      </CollapsedListFilters>

      <div className="text-xs text-slate-500">
        {summary.chronic} chronic (&gt;20%) · {summary.total} entities
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(Object.keys(TAB_LABELS) as GroupBy[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-2 text-sm ${staged.draft.groupBy === tab ? "border-b-2 border-slate-300 font-medium text-slate-700" : "text-slate-600"}`}
            onClick={() => {
              staged.setDraft((current) => ({ ...current, groupBy: tab }));
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {reportQuery.isError ? (
        <ListErrorState
          title="Couldn't load late arrival report"
          {...formatQueryErrorDetail(reportQuery.error)}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.entity_id}
          loading={reportQuery.isPending || (reportQuery.isFetching && rows.length === 0)}
          storageKey="late-arrival-report"
          emptyText="No completed stops with scheduled times in this period."
          rowClassName={(row) => (row.chronic_offender ? "bg-slate-50" : "")}
        />
      )}
    </div>
  );
}
