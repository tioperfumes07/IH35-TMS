import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { fetchDriverDaySummary, type HomeDriverDaySummaryRow } from "../../api/home";
import { companyToday } from "../../lib/businessDate";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  operatingCompanyId: string | null;
};

// Company-local "today" (Central), not UTC — at 7 PM Central UTC is already tomorrow, which
// defaulted this picker to a date with no HOS data. See lib/businessDate.
const TODAY = companyToday();

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${month}/${day}/${year}`;
}

export function DriverDaySummaryCard({ operatingCompanyId }: Props) {
  const [date, setDate] = useState(TODAY);
  const query = useQuery({
    queryKey: ["home", "driver-day-summary", operatingCompanyId, date],
    queryFn: () => fetchDriverDaySummary(operatingCompanyId ?? "", date),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];

  const columns: Array<ParityColumn<HomeDriverDaySummaryRow>> = [
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) => <span className="font-medium text-slate-800">{entityLabel(row.driver_name, row.driver_id, "Driver")}</span>,
    },
    {
      key: "miles",
      label: "Miles",
      sortable: true,
      render: (row) => row.miles.toFixed(1),
    },
    {
      key: "hours_on_duty",
      label: "On-duty hrs",
      sortable: true,
      render: (row) => row.hours_on_duty.toFixed(2),
    },
    {
      key: "fuel_stops",
      label: "Fuel stops",
      sortable: true,
      render: (row) => row.fuel_stops,
    },
    {
      key: "on_time_arrivals",
      label: "On-time",
      sortable: true,
      render: (row) => <span className="text-emerald-700">{row.on_time_arrivals}</span>,
    },
    {
      key: "late_arrivals",
      label: "Late",
      sortable: true,
      render: (row) => <span className="text-amber-700">{row.late_arrivals}</span>,
    },
  ];

  return (
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Driver day-summaries</h3>
          <p className="text-xs text-slate-500">Miles, on-duty hours, fuel stops, and arrival timeliness</p>
        </div>
        <DatePicker
          value={date}
          onChange={(next) => setDate(next)}
          className="rounded-sm border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
      {query.isLoading ? (
        <div className="px-3 py-3 text-xs text-slate-500">Loading driver day summary...</div>
      ) : query.isError ? (
        <ListErrorState
          title="Couldn't load summary right now."
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : query.data?.has_data === false ? (
        <div className="px-3 py-3 text-xs text-slate-500">
          No HOS data recorded for drivers on {formatDisplayDate(date)}. Select another date or check the Samsara
          connection.
        </div>
      ) : (
        <div className="px-2 py-2">
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.driver_id}
            storageKey="home-driver-day-summary"
            emptyText="No driver day-summary rows."
            tableTestId="home-driver-day-summary-table"
            rowTestId={(row) => `home-driver-day-summary-row-${row.driver_id}`}
            initialPageSize={25}
          />
        </div>
      )}
    </section>
  );
}
