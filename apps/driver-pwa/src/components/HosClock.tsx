import type { HosClock } from "../api/hos";

type Props = {
  clock: HosClock;
  label: string;
  remainingLabel: string;
};

function colorForMinutes(minutes: number) {
  if (minutes > 120) return { ring: "#14532d", text: "#86efac", label: "healthy" as const };
  if (minutes >= 30) return { ring: "#92400e", text: "#fcd34d", label: "caution" as const };
  return { ring: "#7f1d1d", text: "#fca5a5", label: "critical" as const };
}

export function HosClockCard({ clock, label, remainingLabel }: Props) {
  const pct = Math.max(0, Math.min(1, clock.remaining_minutes / Math.max(1, clock.max_minutes)));
  const color = colorForMinutes(clock.remaining_minutes);
  const totalHours = Math.floor(clock.remaining_minutes / 60);
  const totalMinutes = Math.floor(clock.remaining_minutes % 60);
  return (
    <div className="rounded-lg border border-pwa-border bg-pwa-card p-3">
      <div className="text-xs text-pwa-text-secondary">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="h-14 w-14 rounded-full"
          style={{
            background: `conic-gradient(${color.ring} ${Math.round(pct * 360)}deg, #404756 0deg)`,
          }}
        />
        <div>
          <div className="text-lg font-semibold" style={{ color: color.text }}>
            {totalHours}h {totalMinutes}m
          </div>
          <div className="text-xs text-pwa-text-secondary">{remainingLabel}</div>
          <div className="text-[10px] uppercase tracking-[0.04em] text-pwa-text-secondary">{color.label}</div>
        </div>
      </div>
    </div>
  );
}
