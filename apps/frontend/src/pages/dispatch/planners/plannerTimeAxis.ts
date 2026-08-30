/**
 * Shared Gantt time-axis helpers (two-row month + weekday/day).
 * §7: slate only — weekend wash, month-start edge, today = slate-800 header (never amber).
 */

export function todayYmdAmericaChicago(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function plannerWeekdayShort(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 2);
}

export function plannerUtcDow(isoYmd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
}

export function isPlannerWeekend(isoYmd: string): boolean {
  const dow = plannerUtcDow(isoYmd);
  return dow === 0 || dow === 6;
}

export function isPlannerMonday(isoYmd: string): boolean {
  return plannerUtcDow(isoYmd) === 1;
}

export function isPlannerMonthStart(isoYmd: string): boolean {
  return isoYmd.slice(8, 10) === "01";
}

export function plannerMonthKey(isoYmd: string): string {
  return isoYmd.slice(0, 7);
}

export function plannerMonthLabel(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoYmd);
  if (!m) return isoYmd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function plannerMonthBands(days: string[]): Array<{ key: string; label: string; span: number }> {
  const bands: Array<{ key: string; label: string; span: number }> = [];
  let i = 0;
  while (i < days.length) {
    const key = plannerMonthKey(days[i]);
    let span = 1;
    while (i + span < days.length && plannerMonthKey(days[i + span]) === key) span += 1;
    bands.push({ key: `${key}-${i}`, label: plannerMonthLabel(days[i]), span });
    i += span;
  }
  return bands;
}

export function plannerDayHeadClass(isoYmd: string, todayYmd: string): string {
  const weekend = isPlannerWeekend(isoYmd);
  const monthStart = isPlannerMonthStart(isoYmd);
  const today = isoYmd === todayYmd;
  return [
    "border-b px-0.5 py-0 text-center font-normal",
    monthStart ? "border-l-2 border-l-slate-500" : "border-l border-l-slate-300",
    today ? "bg-slate-800 text-white" : weekend ? "bg-slate-100 text-slate-500" : "bg-white text-gray-500",
  ].join(" ");
}

export function plannerDayBodyClass(isoYmd: string, todayYmd: string, extra = ""): string {
  const weekend = isPlannerWeekend(isoYmd);
  const monthStart = isPlannerMonthStart(isoYmd);
  const today = isoYmd === todayYmd;
  return [
    "h-[34px] px-0 py-0 text-center",
    monthStart ? "border-l-2 border-l-slate-500" : "border-l border-l-slate-300",
    today ? "shadow-[inset_3px_0_0_0_#334155]" : "",
    weekend && !today ? "bg-slate-100" : "",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatPlannerDwell(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0) return `${days}d ${rem}h`;
  return `${hours}h`;
}
