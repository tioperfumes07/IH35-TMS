// Shared QuickBooks-style time field — separate from the date (Block P).
// Value is "HH:MM" (24h); pairs beside a DatePicker.
type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

export function TimePicker({ value, onChange, className = "", disabled, id, ariaLabel }: Props) {
  return (
    <input
      id={id}
      aria-label={ariaLabel ?? "Time"}
      type="time"
      disabled={disabled}
      className={`h-7 rounded border border-gray-300 px-2 text-xs ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
