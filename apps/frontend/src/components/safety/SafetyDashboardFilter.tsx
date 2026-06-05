export type SafetyDriverFilter = "active" | "resolved" | "all";
export type SafetyActivityWindow = "7d" | "10d" | "30d" | "90d" | "all";

type Props = {
  value: SafetyDriverFilter;
  onChange: (next: SafetyDriverFilter) => void;
  activityWindow: SafetyActivityWindow;
  onActivityWindowChange: (next: SafetyActivityWindow) => void;
  shown: number;
  total: number;
};

const STATUS_OPTIONS: Array<{ id: SafetyDriverFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

const WINDOW_OPTIONS: Array<{ id: SafetyActivityWindow; label: string }> = [
  { id: "7d", label: "7d" },
  { id: "10d", label: "10d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All time" },
];

function pill(active: boolean) {
  return active
    ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" }
    : { background: "white", borderColor: "#cbd5e1", color: "#475569" };
}

export function SafetyDashboardFilter({
  value,
  onChange,
  activityWindow,
  onActivityWindowChange,
  shown,
  total,
}: Props) {
  const hidden = Math.max(0, total - shown);
  return (
    <div className="space-y-0 border-b border-gray-200 bg-gray-50 px-[22px] py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">Activity window:</span>
        {WINDOW_OPTIONS.map((option) => {
          const active = option.id === activityWindow;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`safety-window-${option.id}`}
              onClick={() => onActivityWindowChange(option.id)}
              className="rounded-full border px-2.5 py-0.5"
              style={pill(active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-500">Status:</span>
        {STATUS_OPTIONS.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`safety-status-${option.id}`}
              onClick={() => onChange(option.id)}
              className="rounded-full border px-2.5 py-0.5"
              style={pill(active)}
            >
              {option.label}
            </button>
          );
        })}
        <span className="ml-auto text-slate-400">
          {shown} active · {hidden} resolved · {total} total · window {activityWindow}
        </span>
      </div>
    </div>
  );
}
