import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriverSafetyTrend, type DriverSafetyScoreRow } from "../../../api/safety";

type Props = {
  companyId: string;
  driverUuid: string;
  driverName: string;
  onClose: () => void;
};

function TrendChart({ periods }: { periods: DriverSafetyScoreRow[] }) {
  const points = periods
    .map((row) => row.composite_score)
    .filter((value): value is number => value != null);

  if (points.length < 2) {
    return <div className="h-16 text-xs text-slate-500">Not enough scored periods for a trend yet.</div>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coordinates = points
    .map((value, idx) => {
      const x = (idx / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 100" className="h-24 w-full rounded border border-slate-100 bg-slate-50 p-2">
        <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{periods[0]?.period_start ?? ""}</span>
        <span>{periods[periods.length - 1]?.period_end ?? ""}</span>
      </div>
    </div>
  );
}

export function DriverScoreDetail({ companyId, driverUuid, driverName, onClose }: Props) {
  const trendQuery = useQuery({
    queryKey: ["safety", "driver-scoring", "trend", companyId, driverUuid],
    queryFn: () => listDriverSafetyTrend(companyId, driverUuid, 12),
    enabled: Boolean(companyId && driverUuid),
  });

  const periods = trendQuery.data?.periods ?? [];
  const latest = useMemo(() => (periods.length > 0 ? periods[periods.length - 1] : null), [periods]);

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{driverName}</h4>
          <p className="text-xs text-slate-500">12-period composite safety trend</p>
        </div>
        <button type="button" className="text-xs text-slate-600 underline" onClick={onClose}>
          Close
        </button>
      </div>

      <TrendChart periods={periods} />

      {latest ? (
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div className="rounded border border-slate-100 p-2">
            <div className="text-slate-500">Latest score</div>
            <div className="font-semibold">{latest.composite_score?.toFixed(1) ?? "N/A"}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-slate-500">Fleet rank</div>
            <div className="font-semibold">{latest.rank_in_fleet ?? "—"}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-slate-500">Miles</div>
            <div className="font-semibold">{latest.miles_driven.toFixed(0)}</div>
          </div>
          <div className="rounded border border-slate-100 p-2">
            <div className="text-slate-500">Period</div>
            <div className="font-semibold">
              {latest.period_start} → {latest.period_end}
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-100">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Period</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-right">Rank</th>
              <th className="px-2 py-1 text-right">Brakes</th>
              <th className="px-2 py-1 text-right">Accel</th>
              <th className="px-2 py-1 text-right">Speeding (s)</th>
              <th className="px-2 py-1 text-right">Lane</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((row) => (
              <tr key={`${row.period_start}-${row.period_end}`} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  {row.period_start} → {row.period_end}
                </td>
                <td className="px-2 py-1 text-right">{row.composite_score?.toFixed(1) ?? "N/A"}</td>
                <td className="px-2 py-1 text-right">{row.rank_in_fleet ?? "—"}</td>
                <td className="px-2 py-1 text-right">{row.harsh_brake_count}</td>
                <td className="px-2 py-1 text-right">{row.hard_accel_count}</td>
                <td className="px-2 py-1 text-right">{row.speeding_seconds}</td>
                <td className="px-2 py-1 text-right">{row.lane_departure_count}</td>
              </tr>
            ))}
            {periods.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                  No historical periods stored for this driver.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
