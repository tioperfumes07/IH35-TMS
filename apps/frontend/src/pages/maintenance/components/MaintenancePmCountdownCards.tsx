import type { MaintPmDueRow } from "../../../api/maintenance";

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

function formatCountdown(row: MaintPmDueRow | undefined) {
  if (!row) return "No active schedule";
  const isOverdue = (row.days_remaining ?? 0) < 0 || (row.miles_remaining ?? 0) < 0;
  if (isOverdue) return "Overdue now";
  if (row.days_remaining != null) {
    return `${Math.max(0, row.days_remaining)} day${Math.max(0, row.days_remaining) === 1 ? "" : "s"} left`;
  }
  if (row.miles_remaining != null) {
    return `${Math.max(0, row.miles_remaining).toLocaleString()} mi left`;
  }
  return "Countdown unavailable";
}

export function MaintenancePmCountdownCards({ rows, loading = false, compact = false }: Props) {
  if (compact) {
    return (
      <section className="overflow-hidden rounded border border-gray-200 bg-white">
        <div className="bg-gray-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          PM Countdown
        </div>
        {loading ? (
          <div className="px-2 py-1.5 text-[11px] text-gray-400">Loading...</div>
        ) : (
          <div className="flex flex-col">
            {CARD_TYPES.map((card) => {
              const cardRows = rows.filter((row) => row.pm_type === card.id);
              const dueCount = cardRows.filter((row) => row.is_due).length;
              const overdueCount = cardRows.filter((row) => (row.days_remaining ?? 0) < 0 || (row.miles_remaining ?? 0) < 0).length;
              const nextRow = [...cardRows].sort((a, b) => {
                const aDays = a.days_remaining ?? Number.MAX_SAFE_INTEGER;
                const bDays = b.days_remaining ?? Number.MAX_SAFE_INTEGER;
                const aMiles = a.miles_remaining ?? Number.MAX_SAFE_INTEGER;
                const bMiles = b.miles_remaining ?? Number.MAX_SAFE_INTEGER;
                return aDays !== bDays ? aDays - bDays : aMiles - bMiles;
              })[0];
              return (
                <div key={card.id} className="border-t border-gray-100 px-2 py-1 first:border-t-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{card.label}</span>
                    <span className="text-[11px] font-semibold text-gray-900">{dueCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">{formatCountdown(nextRow)}</span>
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
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">PM Countdown</h3>
        <span className="text-xs text-gray-500">oil / tires / DOT / brake</span>
      </div>
      {loading ? (
        <div className="text-xs text-gray-500">Loading PM due countdown...</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CARD_TYPES.map((card) => {
            const cardRows = rows.filter((row) => row.pm_type === card.id);
            const dueCount = cardRows.filter((row) => row.is_due).length;
            const overdueCount = cardRows.filter((row) => (row.days_remaining ?? 0) < 0 || (row.miles_remaining ?? 0) < 0).length;
            const nextRow = [...cardRows].sort((a, b) => {
              const aDays = a.days_remaining ?? Number.MAX_SAFE_INTEGER;
              const bDays = b.days_remaining ?? Number.MAX_SAFE_INTEGER;
              const aMiles = a.miles_remaining ?? Number.MAX_SAFE_INTEGER;
              const bMiles = b.miles_remaining ?? Number.MAX_SAFE_INTEGER;
              return aDays !== bDays ? aDays - bDays : aMiles - bMiles;
            })[0];
            return (
              <div key={card.id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">{card.label}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{dueCount}</div>
                <div className="text-[11px] text-gray-600">{formatCountdown(nextRow)}</div>
                <div className="mt-1 text-[11px] text-red-600">{overdueCount} overdue</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
