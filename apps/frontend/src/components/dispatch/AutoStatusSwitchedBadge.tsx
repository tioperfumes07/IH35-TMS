type Props = {
  reason?: string | null;
  caseId?: "A" | "B" | "C" | null;
  className?: string;
};

export function AutoStatusSwitchedBadge({ reason, caseId, className = "" }: Props) {
  if (!reason && !caseId) return null;

  const tooltip = reason ?? "Status was updated automatically from GPS movement.";
  const label = caseId ? `Auto (${caseId})` : "Auto";

  return (
    <span
      className={`inline-flex items-center rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${className}`}
      title={tooltip}
      aria-label={`Auto status switch: ${tooltip}`}
    >
      {label}
    </span>
  );
}
