import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { fetchDriverDaySummary, type HomeDriverDaySummaryRow } from "../../api/home";
import { companyToday } from "../../lib/businessDate";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { CollapsedListFilters, useStagedListFilters } from "../table";

type Props = {
  operatingCompanyId: string | null;
};

// Company-local "today" (Central), not UTC — at 7 PM Central UTC is already tomorrow, which
// defaulted this picker to a date with no HOS data. See lib/businessDate.
const TODAY = companyToday();

type ActivityFilter = "all" | "active" | "late" | "no_activity";

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${month}/${day}/${year}`;
}

export function DriverDaySummaryCard({ operatingCompanyId }: Props) {
  const [date, setDate] = useState(TODAY);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const stagedFilters = useStagedListFilters({
    applied: { activityFilter },
    empty: { activityFilter: "all" as ActivityFilter },
    onApply: (next) => setActivityFilter(next.activityFilter),
  });
  const query = useQuery({
    queryKey: ["home", "driver-day-summary", operatingCompanyId, date],
    queryFn: () => fetchDriverDaySummary(operatingCompanyId ?? "", date),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const filteredRows = useMemo(() => {
    if (activityFilter === "active") {
      return rows.filter((row) => row.miles > 0 || row.hours_on_duty > 0 || row.fuel_stops > 0);
    }
    if (activityFilter === "late") return rows.filter((row) => row.late_arrivals > 0);
    if (activityFilter === "no_activity") {
      return rows.filter(
        (row) => row.miles === 0 && row.hours_on_duty === 0 && row.fuel_stops === 0 && row.late_arrivals === 0,
      );
    }
    return rows;
  }, [activityFilter, rows]);

  const columns: Array<ParityColumn<HomeDriverDaySummaryRow>> = [
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (row) => (
        <EntityLink
          kind="driver"
          id={row.driver_id}
          label={entityLabel(row.driver_name, row.driver_id, "Driver")}
          className="font-medium text-slate-800"
        />
      ),
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
          <h3 className="text-xs font-semibold text-slate-900">Driver day-summaries</h3>
          <p className="text-xs text-slate-500">Miles, on-duty hours, fuel stops, and arrival timeliness</p>
        </div>
        <DatePicker
          value={date}
          onChange={(next) => setDate(next)}
          className=""
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
      ) : (
        <div className="px-2 py-2">
          {/*
            LV-HOME-DRIVER-DAY-SUMMARY-EMPTY-HIDES-TOOLBAR — always mount ParityTable so
            Search/Range/gear/Filter stay present when has_data=false. Honest empty copy
            stays in emptyText (neutral slate via ParityTable empty cell), never a red error.
          */}
          <ParityTable
            rows={filteredRows}
            columns={columns}
            rowKey={(row) => row.driver_id}
            storageKey="home-driver-day-summary"
            emptyText={
              query.data?.has_data === false
                ? `No HOS data recorded for drivers on ${formatDisplayDate(date)}. Select another date or check the Samsara connection.`
                : "No driver day-summary rows."
            }
            tableTestId="home-driver-day-summary-table"
            rowTestId={(row) => `home-driver-day-summary-row-${row.driver_id}`}
            initialPageSize={25}
            filterBar={
              <CollapsedListFilters
                activeFilterCount={activityFilter === "all" ? 0 : 1}
                onApply={stagedFilters.apply}
                onReset={stagedFilters.reset}
                onCancel={stagedFilters.cancel}
                applyDisabled={!stagedFilters.dirty}
                testIdPrefix="home-driver-day-summary"
              >
                <label className="block text-xs font-semibold text-slate-600">
                  Driver activity
                  <select
                    aria-label="Driver activity filter"
                    className="mt-1 h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-xs"
                    value={stagedFilters.draft.activityFilter}
                    onChange={(event) =>
                      stagedFilters.setDraft({ activityFilter: event.target.value as ActivityFilter })
                    }
                  >
                    <option value="all">All drivers</option>
                    <option value="active">Recorded activity</option>
                    <option value="late">Late arrival</option>
                    <option value="no_activity">No recorded activity</option>
                  </select>
                </label>
              </CollapsedListFilters>
            }
          />
        </div>
      )}
    </section>
  );
}
