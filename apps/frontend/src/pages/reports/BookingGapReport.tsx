import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ReportsSubNav } from "./ReportsSubNav";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { useCompanyContext } from "../../contexts/CompanyContext";

interface DispatcherStats {
  dispatcher_id: string | null;
  dispatcher_label: string;
  loads_counted: number;
  avg_gap_hours: number;
  p50_gap_hours: number;
  p90_gap_hours: number;
  rank: number;
}

type Period = "week" | "month" | "quarter";

const PERIOD_LABELS: Record<Period, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

const DEFAULT_PERIOD: Period = "week";

function periodDates(p: Period): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  const days = p === "week" ? 7 : p === "month" ? 30 : 90;
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function rowColor(rank: number, total: number): string {
  if (total < 2) return "";
  if (rank === 1) return "bg-green-50";
  if (rank === total) return "bg-amber-50";
  return "";
}

export function BookingGapReport() {
  // BOOKING-GAP-REPORT-NEVER-FETCHES-DEAD-QUERY: this read `sessionStorage["operating_company_id"]`,
  // a key nothing in this codebase has ever written (repo-wide grep for a matching setItem: zero
  // hits) — operatingCompanyId was always "", the query was permanently `enabled: false`, and every
  // "No data available" this page ever showed was a false empty, not a real one. Every sibling
  // report page sources the entity id from the reactive company-switcher context instead.
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const emptyFilters = { period: DEFAULT_PERIOD as Period };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({
    applied,
    empty: emptyFilters,
    onApply: setApplied,
  });
  const { from, to } = periodDates(applied.period);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ data: { dispatchers: DispatcherStats[] } }>({
    queryKey: ["booking-gap", operatingCompanyId, from, to],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/dispatch/analytics/booking-gap?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${from}&to=${to}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load booking gap report");
      return res.json() as Promise<{ data: { dispatchers: DispatcherStats[] } }>;
    },
    enabled: !!operatingCompanyId,
  });

  const dispatchers = data?.data?.dispatchers ?? [];

  const columns = useMemo<ParityColumn<DispatcherStats>[]>(
    () => [
      {
        key: "rank",
        label: "Rank",
        sortable: true,
        render: (row) => <span className="font-medium">#{row.rank}</span>,
      },
      {
        key: "dispatcher_label",
        label: "Dispatcher",
        sortable: true,
      },
      {
        key: "loads_counted",
        label: "Loads",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
      },
      {
        key: "avg_gap_hours",
        label: "Avg Gap (h)",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.avg_gap_hours.toFixed(1),
      },
      {
        key: "p50_gap_hours",
        label: "P50 (h)",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.p50_gap_hours.toFixed(1),
      },
      {
        key: "p90_gap_hours",
        label: "P90 (h)",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.p90_gap_hours.toFixed(1),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <ReportsSubNav />
      <PageHeader
        backHref="/reports"
        breadcrumb={["Reports", "Dispatcher Booking Gap"]}
        title="Dispatcher Booking Gap"
      />

      <CollapsedListFilters
        activeFilterCount={applied.period !== DEFAULT_PERIOD ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-booking-gap"
        className="mb-4"
      >
        <label className="text-xs text-gray-600">
          Period
          <select
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={staged.draft.period}
            onChange={(event) =>
              staged.setDraft((p) => ({ ...p, period: event.target.value as Period }))
            }
            aria-label="Period"
            data-testid="reports-booking-gap-period"
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </CollapsedListFilters>

      <p className="text-sm text-gray-500 mb-4">
        Average time between load delivery and next truck assignment. Lower is better (driver stays
        productive). Excludes gaps &gt;24h (weekends/planned downtime).
      </p>

      {isError && (
        <ListErrorState
          title="Couldn't load booking gap report"
          status={0}
          message={userFacingApiError(error, "Request failed")}
          onRetry={() => void refetch()}
        />
      )}

      {!isError && (
        <ParityTable
          rows={dispatchers}
          columns={columns}
          rowKey={(row) => row.dispatcher_id ?? row.dispatcher_label}
          loading={isLoading || (isFetching && dispatchers.length === 0)}
          storageKey="booking-gap-report"
          emptyText="No data available for this period."
          rowClassName={(row) => rowColor(row.rank, dispatchers.length)}
        />
      )}
    </div>
  );
}

export default BookingGapReport;
