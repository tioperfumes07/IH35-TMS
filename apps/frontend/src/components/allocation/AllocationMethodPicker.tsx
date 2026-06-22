import type { AllocationMethod } from "./types";

type Props = {
  value: AllocationMethod;
  onChange: (value: AllocationMethod) => void;
  disabled?: boolean;
};

const OPTIONS: Array<{ value: AllocationMethod; label: string; hint: string }> = [
  { value: "equal", label: "Equal split", hint: "Divide bill total evenly across selected assets" },
  { value: "by_value", label: "By insured value", hint: "Weight by asset insured value" },
  { value: "by_miles", label: "By miles", hint: "Weight by period miles per asset" },
  { value: "manual_pct", label: "Manual %", hint: "Enter percentages that sum to 100" },
];

export function AllocationMethodPicker({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Allocation method</legend>
      <div className="grid gap-2 md:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col rounded border px-3 py-2 text-sm ${
              value === option.value ? "border-slate-300 bg-slate-100" : "border-gray-200 bg-white"
            } ${disabled ? "opacity-60" : ""}`}
          >
            <span className="flex items-center gap-2 font-medium text-gray-900">
              <input
                type="radio"
                name="allocation-method"
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </span>
            <span className="mt-1 text-xs text-gray-600">{option.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
