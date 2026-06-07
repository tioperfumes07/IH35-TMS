/**
 * Tire Wear Projection Chart — GAP-62 / CAP-12
 * Per-tire tread depth trend with projected replacement threshold line.
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TreadMeasurementPoint = {
  measured_at: string;
  tread_depth_32nds: number;
};

export type TireWearProjectionChartProps = {
  position: string;
  measurements: TreadMeasurementPoint[];
  threshold32nds: number;
  projectedReplacementDate?: string | null;
};

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TireWearProjectionChart({
  position,
  measurements,
  threshold32nds,
  projectedReplacementDate,
}: TireWearProjectionChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...measurements].sort(
      (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
    );
    return sorted.map((m) => ({
      label: formatDateLabel(m.measured_at),
      depth: m.tread_depth_32nds,
      threshold: threshold32nds,
    }));
  }, [measurements, threshold32nds]);

  if (chartData.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-4 text-xs text-gray-500" data-testid="tire-wear-chart-empty">
        No tread measurements recorded for {position}.
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-3" data-testid="tire-wear-projection-chart">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-gray-900">{position} tread trend</h4>
        {projectedReplacementDate ? (
          <span className="text-[11px] text-amber-700">
            Projected replacement: {formatDateLabel(projectedReplacementDate)}
          </span>
        ) : null}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, "auto"]} tick={{ fontSize: 10 }} label={{ value: "32nds", angle: -90, position: "insideLeft", fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={threshold32nds} stroke="#dc2626" strokeDasharray="4 4" label={`DOT ${threshold32nds}/32"`} />
            <Line type="monotone" dataKey="depth" name="Tread depth" stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
