import type { DriverIncidentType, IncidentSeverity } from "../api/incidents";

const WARNING_BORDER = "border-[#f59e0b] text-[#fcd34d]";
const CRITICAL_BORDER = "border-[#dc2626] text-[#fca5a5]";
const CARGO_BORDER = "border-[#ca8a04] text-[#fde047]";
const OTHER_BORDER = "border-[#64748b] text-[#cbd5e1]";

function borderForType(type: DriverIncidentType) {
  if (type === "cargo_issue") return CARGO_BORDER;
  if (type === "other") return OTHER_BORDER;
  if (type === "accident_major" || type === "mechanical_breakdown") return CRITICAL_BORDER;
  return WARNING_BORDER;
}

export function inferSeverity(type: DriverIncidentType): IncidentSeverity {
  if (type === "accident_major" || type === "mechanical_breakdown") return "critical";
  if (type === "cargo_issue" || type === "accident_minor" || type === "check_engine_warning") return "warning";
  return "info";
}

export function IncidentTypeRadio({
  value,
  onChange,
  labels,
}: {
  value: DriverIncidentType;
  onChange: (next: DriverIncidentType) => void;
  labels: Record<DriverIncidentType, string>;
}) {
  const ordered: DriverIncidentType[] = [
    "check_engine_warning",
    "mechanical_breakdown",
    "accident_minor",
    "accident_major",
    "cargo_issue",
    "other",
  ];
  return (
    <div className="grid gap-2">
      {ordered.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm ${
            value === type ? `${borderForType(type)} bg-[#101522]` : "border-pwa-border text-pwa-text-secondary"
          }`}
        >
          {labels[type]}
        </button>
      ))}
    </div>
  );
}
