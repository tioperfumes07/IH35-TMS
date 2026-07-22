/**
 * h-05 — Home KPI date-range toggle (Today / 7d / 30d / MTD / YTD).
 *
 * QBO-dashboard-style range presets for the Home KPI row. The server resolves each preset to an
 * inclusive window in the company timezone (America/Chicago) — the frontend never composes dates.
 * Pill grammar matches the Bills category chips (slate active state, locked palette — no recolor).
 */
import { HOME_KPI_RANGES, type HomeKpiRange } from "../../api/home";

export const HOME_KPI_RANGE_LABELS: Record<HomeKpiRange, string> = {
  today: "Today",
  "7d": "7d",
  "30d": "30d",
  mtd: "MTD",
  ytd: "YTD",
};

/** Card-label suffix for the revenue KPI (e.g. "Revenue (30d)"); Today keeps the legacy label. */
export function revenueKpiLabel(range: HomeKpiRange): string {
  if (range === "today") return "Today's Revenue";
  return `Revenue (${HOME_KPI_RANGE_LABELS[range]})`;
}

type Props = {
  value: HomeKpiRange;
  onChange: (next: HomeKpiRange) => void;
};

export function HomeKpiRangeToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="home-kpi-range-toggle">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Range:</span>
      {HOME_KPI_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          data-testid={`home-kpi-range-${range}`}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            value === range
              ? "border-slate-300 bg-slate-100 text-slate-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
          onClick={() => onChange(range)}
        >
          {HOME_KPI_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}
