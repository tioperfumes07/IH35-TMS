export type FreshnessCacheTier = 1 | 2 | 3 | 4;

export type FreshnessColor = "green" | "amber" | "red";

export type FreshnessIndicatorProps = {
  lastFetchedAt: string | null;
  cacheTier: FreshnessCacheTier | null;
};

const GREEN_MAX_MS = 30_000;
const RED_MIN_MS = 120_000;

export function ageMsFrom(lastFetchedAt: string | null, nowMs = Date.now()): number | null {
  if (!lastFetchedAt) return null;
  const parsed = Date.parse(lastFetchedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}

export function tierLabel(cacheTier: FreshnessCacheTier | null): string {
  if (cacheTier === null) return "L?";
  return `L${cacheTier}`;
}

export function formatFreshnessAge(lastFetchedAt: string | null, nowMs = Date.now()): string {
  const ageMs = ageMsFrom(lastFetchedAt, nowMs);
  if (ageMs === null) return "stale";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

export function freshnessColor(
  lastFetchedAt: string | null,
  cacheTier: FreshnessCacheTier | null,
  nowMs = Date.now()
): FreshnessColor {
  const ageMs = ageMsFrom(lastFetchedAt, nowMs);

  if (cacheTier === null || cacheTier === 4 || ageMs === null) {
    return "red";
  }
  if (ageMs >= RED_MIN_MS) {
    return "red";
  }
  if (cacheTier === 3 || ageMs >= GREEN_MAX_MS) {
    return "amber";
  }
  if ((cacheTier === 1 || cacheTier === 2) && ageMs < GREEN_MAX_MS) {
    return "green";
  }
  return "red";
}

const COLOR_CLASS: Record<FreshnessColor, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

export function FreshnessIndicator({ lastFetchedAt, cacheTier }: FreshnessIndicatorProps) {
  const color = freshnessColor(lastFetchedAt, cacheTier);
  const age = formatFreshnessAge(lastFetchedAt);
  const tier = tierLabel(cacheTier);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_CLASS[color]}`}
      title={`Samsara data: ${age} ago (${tier})`}
      data-freshness-color={color}
      data-cache-tier={cacheTier ?? "unknown"}
    >
      <span aria-hidden>{tier}</span>
      <span>{age}</span>
    </span>
  );
}
