import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDriverDaySummary, type HomeDriverDaySummaryRow } from "../../api/home";

type Props = {
  operatingCompanyId: string | null;
};

type SortKey = "driver_name" | "miles" | "hours_on_duty" | "fuel_stops" | "on_time_arrivals" | "late_arrivals";

const TODAY = new Date().toISOString().slice(0, 10);

function compareRows(a: HomeDriverDaySummaryRow, b: HomeDriverDaySummaryRow, sortKey: SortKey): number {
  if (sortKey === "driver_name") return a.driver_name.localeCompare(b.driver_name);
  return Number(b[sortKey]) - Number(a[sortKey]);
}

export function DriverDaySummaryCard({ operatingCompanyId }: Props) {
  const [date, setDate] = useState(TODAY);
  const [sortKey, setSortKey] = useState<SortKey>("miles");
  const query = useQuery({
    queryKey: ["home", "driver-day-summary", operatingCompanyId, date],
    queryFn: () => fetchDriverDaySummary(operatingCompanyId ?? "", date),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => {
    const base = query.data ?? [];
    return [...base].sort((a, b) => compareRows(a, b, sortKey));
  }, [query.data, sortKey]);

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Driver day-summaries</h3>
          <p className="text-xs text-slate-500">Miles, on-duty hours, fuel stops, and arrival timeliness</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
      {query.isLoading ? (
        <div className="px-3 py-3 text-xs text-slate-500">Loading driver day summary...</div>
      ) : query.isError ? (
        <div className="px-3 py-3 text-xs text-red-700">Unable to load day summary for selected date.</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-slate-500">No active driver activity found for this date.</div>
      ) : (
        <div className="overflow-x-auto px-2 py-2">
          <table className="min-w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                {(
                  [
                    ["driver_name", "Driver"],
                    ["miles", "Miles"],
                    ["hours_on_duty", "On-duty hrs"],
                    ["fuel_stops", "Fuel stops"],
                    ["on_time_arrivals", "On-time"],
                    ["late_arrivals", "Late"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="px-2 py-1 font-semibold">
                    <button type="button" onClick={() => setSortKey(key)} className="hover:text-slate-800">
                      {label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driver_id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium text-slate-800">{row.driver_name}</td>
                  <td className="px-2 py-1.5">{row.miles.toFixed(1)}</td>
                  <td className="px-2 py-1.5">{row.hours_on_duty.toFixed(2)}</td>
                  <td className="px-2 py-1.5">{row.fuel_stops}</td>
                  <td className="px-2 py-1.5 text-emerald-700">{row.on_time_arrivals}</td>
                  <td className="px-2 py-1.5 text-amber-700">{row.late_arrivals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
