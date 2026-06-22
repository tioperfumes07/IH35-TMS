import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriverSafetyPeriodScores, type DriverSafetyScoreRow } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DriverScoreDetail } from "./DriverScoreDetail";

type PeriodPreset = "week" | "month" | "quarter";

function periodBounds(preset: PeriodPreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (preset === "week") from.setDate(from.getDate() - 6);
  if (preset === "month") from.setDate(from.getDate() - 29);
  if (preset === "quarter") from.setDate(from.getDate() - 89);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function scoreClass(score: number | null) {
  if (score == null) return "text-slate-500";
  if (score >= 85) return "text-emerald-700";
  if (score >= 70) return "text-amber-700";
  return "text-red-700";
}

export function DriverScoringTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [selectedDriver, setSelectedDriver] = useState<DriverSafetyScoreRow | null>(null);
  const bounds = useMemo(() => periodBounds(preset), [preset]);

  const leaderboardQuery = useQuery({
    queryKey: ["safety", "driver-scoring", "period", companyId, bounds.from, bounds.to],
    queryFn: () => listDriverSafetyPeriodScores(companyId, bounds.from, bounds.to),
    enabled: Boolean(companyId),
  });

  const rows = leaderboardQuery.data?.rows ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Driver Safety Scoring</h3>
          <p className="text-xs text-slate-500">
            Composite score from harsh events and telematics miles (min 500 mi to rank).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Period</span>
          {(["week", "month", "quarter"] as PeriodPreset[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreset(value)}
              className={`rounded px-2 py-1 capitalize ${preset === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Rank</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-right">Brakes</th>
              <th className="px-2 py-1 text-right">Accel</th>
              <th className="px-2 py-1 text-right">Speeding (s)</th>
              <th className="px-2 py-1 text-right">Lane</th>
              <th className="px-2 py-1 text-right">Miles</th>
              <th className="px-2 py-1 text-left">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driver_uuid} className="border-t border-gray-100">
                <td className="px-2 py-1">{row.rank_in_fleet ?? "—"}</td>
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className={`px-2 py-1 text-right font-semibold ${scoreClass(row.composite_score)}`}>
                  {row.composite_score == null ? "N/A" : row.composite_score.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right">{row.harsh_brake_count}</td>
                <td className="px-2 py-1 text-right">{row.hard_accel_count}</td>
                <td className="px-2 py-1 text-right">{row.speeding_seconds}</td>
                <td className="px-2 py-1 text-right">{row.lane_departure_count}</td>
                <td className="px-2 py-1 text-right">{row.miles_driven.toFixed(0)}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => setSelectedDriver(row)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-center text-slate-500">
                  No composite scores for this period yet. Weekly aggregation runs Monday 3am CT.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedDriver ? (
        <DriverScoreDetail
          companyId={companyId}
          driverUuid={selectedDriver.driver_uuid}
          driverName={selectedDriver.driver_name}
          onClose={() => setSelectedDriver(null)}
        />
      ) : null}
    </div>
  );
}
