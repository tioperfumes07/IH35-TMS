type Severity = "CRIT" | "WARN" | "INFO";

const STYLES: Record<Severity, { bg: string; fg: string }> = {
  CRIT: { bg: "#fee2e2", fg: "#991b1b" },
  WARN: { bg: "#fef3c7", fg: "#92400e" },
  INFO: { bg: "#dbeafe", fg: "#1e3a8a" },
};

type Props = {
  value: Severity;
};

export function SeverityPill({ value }: Props) {
  const palette = STYLES[value];
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ backgroundColor: palette.bg, color: palette.fg }}>
      {value}
    </span>
  );
}
