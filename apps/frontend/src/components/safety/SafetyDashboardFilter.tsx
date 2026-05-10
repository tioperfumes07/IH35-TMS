export type SafetyDriverFilter = "active" | "resolved" | "all";

type Props = {
  value: SafetyDriverFilter;
  onChange: (next: SafetyDriverFilter) => void;
  shown: number;
  total: number;
};

const OPTIONS: Array<{ id: SafetyDriverFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

export function SafetyDashboardFilter({ value, onChange, shown, total }: Props) {
  const hidden = Math.max(0, total - shown);
  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-[22px] py-2 text-[11px]">
      <span className="font-semibold text-slate-500">Safety Filter:</span>
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded-full border px-2.5 py-0.5"
            style={
              active
                ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" }
                : { background: "white", borderColor: "#cbd5e1", color: "#475569" }
            }
          >
            {option.label}
          </button>
        );
      })}
      <span className="ml-auto text-slate-400">
        {shown} active · {hidden} resolved · {total} total
      </span>
    </div>
  );
}
