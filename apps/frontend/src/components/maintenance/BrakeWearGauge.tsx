/**
 * Brake Wear Gauge — GAP-63 / CAP-13
 * Visual gauge per brake position (green / amber / red vs DOT threshold).
 */
export type BrakeWearGaugeProps = {
  position: string;
  thicknessMm: number | null;
  thresholdMm: number;
  projectedDate?: string | null;
};

export type GaugeStatus = "green" | "amber" | "red" | "unknown";

export function gaugeStatus(thicknessMm: number | null, thresholdMm: number): GaugeStatus {
  if (thicknessMm == null) return "unknown";
  if (thicknessMm <= thresholdMm) return "red";
  if (thicknessMm <= thresholdMm + 2) return "amber";
  return "green";
}

const STATUS_STYLES: Record<GaugeStatus, { bar: string; text: string; label: string }> = {
  green: { bar: "bg-emerald-500", text: "text-emerald-800", label: "Healthy" },
  amber: { bar: "bg-amber-500", text: "text-amber-800", label: "Monitor" },
  red: { bar: "bg-red-600", text: "text-red-800", label: "At risk" },
  unknown: { bar: "bg-gray-300", text: "text-gray-600", label: "No data" },
};

export function BrakeWearGauge({ position, thicknessMm, thresholdMm, projectedDate }: BrakeWearGaugeProps) {
  const status = gaugeStatus(thicknessMm, thresholdMm);
  const styles = STATUS_STYLES[status];
  const maxMm = Math.max(thresholdMm + 6, thicknessMm ?? thresholdMm + 6, 20);
  const fillPct =
    thicknessMm != null ? Math.min(100, Math.max(0, (thicknessMm / maxMm) * 100)) : 0;
  const thresholdPct = Math.min(100, (thresholdMm / maxMm) * 100);

  return (
    <div className="rounded border border-gray-200 bg-white p-3" data-testid={`brake-wear-gauge-${position}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-900">{position}</span>
        <span className={`text-[11px] font-medium ${styles.text}`}>{styles.label}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`absolute left-0 top-0 h-full ${styles.bar}`}
          style={{ width: `${fillPct}%` }}
          data-testid="brake-wear-gauge-fill"
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-red-700"
          style={{ left: `${thresholdPct}%` }}
          title={`DOT min ${thresholdMm} mm`}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-600">
        <span>{thicknessMm != null ? `${thicknessMm.toFixed(1)} mm` : "—"}</span>
        <span>DOT min {thresholdMm} mm</span>
      </div>
      {projectedDate ? (
        <p className="mt-1 text-[11px] text-amber-700">Projected service: {projectedDate}</p>
      ) : null}
    </div>
  );
}
