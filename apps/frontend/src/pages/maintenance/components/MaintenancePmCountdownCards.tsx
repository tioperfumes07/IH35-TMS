import type { MaintPmDueRow } from "../../../api/maintenance";
import { formatMilesRemainingHonest } from "../../../lib/odometerHonesty";

type Props = {
  rows: MaintPmDueRow[];
  loading?: boolean;
  /** Opt-in narrow-sidebar layout: single column, smaller text, no card chrome. Default false. */
  compact?: boolean;
};

type PmCardType = {
  id: "oil" | "tires" | "dot_inspection" | "brake";
  label: string;
};

const CARD_TYPES: PmCardType[] = [
  { id: "oil", label: "Oil" },
  { id: "tires", label: "Tires" },
  { id: "dot_inspection", label: "DOT" },
  { id: "brake", label: "Brake" },
];

function dueSourceLabel(row: MaintPmDueRow): string | null {
  const reasons = Array.isArray(row.due_reasons) ? row.due_reasons : [];
  const parts: string[] = [];
  if (reasons.includes("miles")) parts.push("by odometer");
  if (reasons.includes("date")) parts.push("by days");
  if (parts.length === 0) {
    if (row.miles_remaining != null) parts.push("by odometer");
    if (row.days_remaining != null) parts.push("by days");
  }
  return parts.length ? parts.join(" · ") : null;
}

function formatCountdown(row: MaintPmDueRow | undefined) {
  if (!row) return "No active schedule";
  const source = dueSourceLabel(row);
  // C-21 — never invent miles left when the live odometer feed is null (Samsara obdOdometerMeters
  // dead since 2026-09-10). Prefer an honest "no odometer reading since <date>" over "0 mi left".
  const milesHonesty = formatMilesRemainingHonest({
    milesRemaining: row.miles_remaining,
    currentOdometerMi: row.current_odometer_mi,
    odometerReadingAt: row.odometer_reading_at,
  });
  const withSource = (text: string) => (source ? `${text} · ${source}` : text);
  if (row.current_odometer_mi == null && milesHonesty) {
    // Still allow a date-based countdown when the schedule has interval_days.
    if (row.days_remaining != null) {
      const isOverdue = row.days_remaining < 0;
      if (isOverdue) return withSource(`Overdue now · ${milesHonesty}`);
      return withSource(
        `${Math.max(0, row.days_remaining)} day${Math.max(0, row.days_remaining) === 1 ? "" : "s"} left · ${milesHonesty}`,
      );
    }
    return withSource(milesHonesty);
  }
  const isOverdue = (row.days_remaining ?? 0) < 0 || (row.miles_remaining ?? 0) < 0;
  if (isOverdue) return withSource("Overdue now");
  if (row.days_remaining != null) {
    return withSource(`${Math.max(0, row.days_remaining)} day${Math.max(0, row.days_remaining) === 1 ? "" : "s"} left`);
  }
  if (milesHonesty) return withSource(milesHonesty);
  return withSource("Countdown unavailable");
}

function pmCardMetrics(rows: MaintPmDueRow[], card: PmCardType) {
  const cardRows = rows.filter((row) => row.pm_type === card.id);
  const dueCount = cardRows.filter((row) => row.is_due).length;
  const overdueCount = cardRows.filter(
    (row) => (row.days_remaining ?? 0) < 0 || (row.miles_remaining ?? 0) < 0,
  ).length;
  const nextRow = [...cardRows].sort((a, b) => {
    const aDays = a.days_remaining ?? Number.MAX_SAFE_INTEGER;
    const bDays = b.days_remaining ?? Number.MAX_SAFE_INTEGER;
    const aMiles = a.miles_remaining ?? Number.MAX_SAFE_INTEGER;
    const bMiles = b.miles_remaining ?? Number.MAX_SAFE_INTEGER;
    return aDays !== bDays ? aDays - bDays : aMiles - bMiles;
  })[0];
  return { dueCount, overdueCount, nextRow };
}

export function MaintenancePmCountdownCards({ rows, loading = false, compact = false }: Props) {
  if (compact) {
    return (
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="bg-gray-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
          PM Countdown
        </div>
        {loading ? (
          <div className="px-2 py-1.5 text-xs text-[#6B7280]">Loading...</div>
        ) : (
          <div className="flex flex-col">
            {CARD_TYPES.map((card) => {
              const { dueCount, overdueCount, nextRow } = pmCardMetrics(rows, card);
              return (
                <div key={card.id} className="border-t border-gray-100 px-2 py-1 first:border-t-0" data-testid={`pm-due-card-${card.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-[#6B7280]">{card.label}</span>
                    <span className="text-xs font-semibold text-[#0F1219]">{dueCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]" data-testid={`pm-due-source-${card.id}`}>{formatCountdown(nextRow)}</span>
                    {overdueCount > 0 ? <span className="text-red-600">{overdueCount} overdue</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-900">PM Countdown</h3>
        <span className="text-xs text-gray-500">oil / tires / DOT / brake</span>
      </div>
      {loading ? (
        <div className="px-3 py-2 text-xs text-gray-500">Loading PM due countdown...</div>
      ) : (
        <div className="flex flex-col">
          {CARD_TYPES.map((card) => {
            const { dueCount, overdueCount, nextRow } = pmCardMetrics(rows, card);
            return (
                <div key={card.id} className="border-t border-gray-100 px-3 py-2 first:border-t-0" data-testid={`pm-due-card-${card.id}`}>
                <div className="text-xs uppercase tracking-wide text-[#6B7280]">{card.label}</div>
                <div className="mt-1 text-page-title font-semibold text-[#0F1219]">{dueCount}</div>
                <div className="text-xs text-[#4B5563]" data-testid={`pm-due-source-${card.id}`}>{formatCountdown(nextRow)}</div>
                {overdueCount > 0 ? (
                  <div className="mt-1 text-xs text-red-600">{overdueCount} overdue</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
