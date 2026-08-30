/**
 * Planner / Round Trips day headers: "Aug 16", never "08-16" (YYYY-MM-DD.slice(5)).
 * Calendar-date only — noon UTC so the month/day parts do not slip across a timezone edge.
 */
export function formatPlannerDayLabel(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return isoYmd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
