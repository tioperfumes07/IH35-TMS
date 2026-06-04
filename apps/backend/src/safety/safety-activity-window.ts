export type SafetyActivityWindow = "7d" | "10d" | "30d" | "90d" | "all";

const WINDOW_DAYS: Record<Exclude<SafetyActivityWindow, "all">, number> = {
  "7d": 7,
  "10d": 10,
  "30d": 30,
  "90d": 90,
};

export function safetyActivityWindowSql(window: SafetyActivityWindow | undefined): string | null {
  const normalized = window ?? "7d";
  if (normalized === "all") return null;
  const days = WINDOW_DAYS[normalized];
  return `event_at >= (now() - interval '${days} days')`;
}
