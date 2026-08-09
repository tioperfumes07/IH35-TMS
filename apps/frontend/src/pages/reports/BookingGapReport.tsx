import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReportsSubNav } from "./ReportsSubNav";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";

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
  const [operatingCompanyId] = useState(
    () => sessionStorage.getItem("operating_company_id") ?? ""
  );
  const [period, setPeriod] = useState<Period>("week");
  const { from, to } = periodDates(period);

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
        actions={
          <div className="flex gap-2">
            {(["week", "month", "quarter"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded capitalize ${
                  period === p
                    ? "bg-[#1F2A44] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

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
