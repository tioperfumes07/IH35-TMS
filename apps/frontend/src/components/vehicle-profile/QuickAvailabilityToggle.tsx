import { Button } from "../Button";

type Value = "available" | "booked" | "holding" | null;

export function QuickAvailabilityToggle({
  value,
  disabled,
  onChange,
}: {
  value: Value;
  disabled?: boolean;
  onChange: (next: Value) => void;
}) {
  const options: Array<{ id: Value; label: string }> = [
    { id: "available", label: "Available" },
    { id: "booked", label: "Booked" },
    { id: "holding", label: "Holding" },
  ];
  return (
    <div className="flex gap-1" data-testid="vp-quick-availability">
      {options.map((opt) => (
        <Button
          key={opt.id ?? "none"}
          size="sm"
          variant={value === opt.id ? "primary" : "secondary"}
          disabled={disabled}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
