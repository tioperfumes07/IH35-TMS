type Props = {
  label: string;
  value: string;
  subtitle: string;
  tone: "driving" | "sleeper" | "onduty_waiting" | "offduty_reset" | "violation";
};

const toneMap: Record<Props["tone"], string> = {
  driving: "border-hos-driving/50 bg-hos-driving/10 text-hos-driving",
  sleeper: "border-hos-sleeper/50 bg-hos-sleeper/10 text-slate-300",
  onduty_waiting: "border-hos-onduty_waiting/50 bg-hos-onduty_waiting/10 text-hos-onduty_waiting",
  offduty_reset: "border-hos-offduty_reset/50 bg-hos-offduty_reset/10 text-hos-offduty_reset",
  violation: "border-hos-violation/50 bg-hos-violation/10 text-hos-violation",
};

export function HosCell({ label, value, subtitle, tone }: Props) {
  return (
    <div className={`rounded-xl border p-3 ${toneMap[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide text-pwa-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-pwa-text-secondary">{subtitle}</p>
    </div>
  );
}
