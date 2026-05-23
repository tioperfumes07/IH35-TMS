import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriverScoreEvents, listDriverScores } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const PERIODS = [7, 30, 90] as const;

export function DriverScoringTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [periodDays, setPeriodDays] = useState<(typeof PERIODS)[number]>(30);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  const scoresQuery = useQuery({
    queryKey: ["safety", "driver-scoring", companyId, periodDays],
    queryFn: () => listDriverScores(companyId, periodDays),
    enabled: Boolean(companyId),
  });

  const selectedDriver = useMemo(
    () => scoresQuery.data?.rows.find((row) => row.driver_id === selectedDriverId) ?? null,
    [scoresQuery.data?.rows, selectedDriverId]
  );

  const eventsQuery = useQuery({
    queryKey: ["safety", "driver-scoring-events", companyId, selectedDriverId, periodDays],
    queryFn: () => listDriverScoreEvents(companyId, selectedDriverId, periodDays),
    enabled: Boolean(companyId && selectedDriverId),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Driver Scoring</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Period</span>
          {PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              className={`rounded px-2 py-1 ${periodDays === days ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-right">Trend</th>
              <th className="px-2 py-1 text-right">Incidents</th>
              <th className="px-2 py-1 text-right">Critical</th>
              <th className="px-2 py-1 text-right">Major</th>
              <th className="px-2 py-1 text-right">Minor</th>
              <th className="px-2 py-1 text-left">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(scoresQuery.data?.rows ?? []).map((row) => (
              <tr key={row.driver_id} className="border-t border-gray-100">
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className="px-2 py-1 text-right font-semibold">{row.score}</td>
                <td className={`px-2 py-1 text-right ${row.trend_vs_prior >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {row.trend_vs_prior >= 0 ? "+" : ""}
                  {row.trend_vs_prior}
                </td>
                <td className="px-2 py-1 text-right">{row.incidents}</td>
                <td className="px-2 py-1 text-right">{row.counts_by_kind.critical}</td>
                <td className="px-2 py-1 text-right">{row.counts_by_kind.major}</td>
                <td className="px-2 py-1 text-right">{row.counts_by_kind.minor}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-blue-700 underline" onClick={() => setSelectedDriverId(row.driver_id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {(scoresQuery.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-center text-slate-500">
                  No driver scoring records in this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedDriver ? (
        <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
          <h4 className="text-sm font-semibold text-slate-900">{selectedDriver.driver_name} - Event Timeline</h4>
          <div className="text-xs text-slate-500">Map view uses event coordinates when available.</div>
          <div className="space-y-1 text-xs">
            {(eventsQuery.data?.events ?? []).slice(0, 50).map((event) => (
              <div key={event.id} className="rounded border border-slate-100 px-2 py-1">
                {String(event.event_at).slice(0, 19).replace("T", " ")} · {event.event_kind} · {event.severity} · Unit {event.unit_number ?? "N/A"} ·
                lat/lng {event.latitude ?? "—"}/{event.longitude ?? "—"}
              </div>
            ))}
            {(eventsQuery.data?.events ?? []).length === 0 ? <div className="text-slate-500">No events for selected driver in period.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
