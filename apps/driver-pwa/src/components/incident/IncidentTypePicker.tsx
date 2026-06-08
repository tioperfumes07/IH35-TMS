import type { DriverIncidentType } from "../../api/incidents";

const ORDERED_TYPES: DriverIncidentType[] = ["accident", "damage", "cargo", "equipment", "injury", "breakdown", "other"];

function tone(type: DriverIncidentType, active: boolean) {
  if (!active) return "border-pwa-border text-pwa-text-secondary";
  if (type === "accident" || type === "injury" || type === "breakdown") {
    return "border-[#dc2626] bg-[#2a0f15] text-[#fecaca]";
  }
  if (type === "cargo" || type === "damage") {
    return "border-[#f59e0b] bg-[#251a09] text-[#fde68a]";
  }
  return "border-[#3b82f6] bg-[#0b1a2d] text-[#bfdbfe]";
}

export function IncidentTypePicker({
  value,
  onChange,
  labels,
}: {
  value: DriverIncidentType;
  onChange: (next: DriverIncidentType) => void;
  labels: Record<DriverIncidentType, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ORDERED_TYPES.map((type) => {
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium ${tone(type, active)}`}
          >
            {labels[type]}
          </button>
        );
      })}
    </div>
  );
}
