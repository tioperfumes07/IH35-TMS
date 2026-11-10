/** ROUND 443.282 / ROUND 8.5 F3 — period windows (Fuel.dc.html). Labels follow the live calendar month, never static Oct/Sep. */
export type FuelBoardPeriodId = "oct" | "sep" | "ytd";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatShortRange(from: Date, to: Date) {
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${MO[from.getMonth()]} ${from.getDate()}–${to.getDate()}`;
  }
  return `${MO[from.getMonth()]} ${from.getDate()} – ${MO[to.getMonth()]} ${to.getDate()}`;
}

export function fuelBoardPeriodRange(period: FuelBoardPeriodId, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "ytd") {
    const from = new Date(y, 0, 1);
    return { from: isoDate(from), to: isoDate(now), labelSuffix: `Jan 1–${MO[now.getMonth()]} ${now.getDate()}` };
  }
  if (period === "sep") {
    const prev = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const from = new Date(prevY, prev, 1);
    const to = new Date(prevY, prev + 1, 0);
    return { from: isoDate(from), to: isoDate(to), labelSuffix: formatShortRange(from, to) };
  }
  const from = new Date(y, m, 1);
  return { from: isoDate(from), to: isoDate(now), labelSuffix: formatShortRange(from, now) };
}

/** Option labels: current month / previous month / YTD (ids stay oct/sep/ytd for URL/storage stability). */
export function fuelBoardPeriodOptions(now = new Date()): { id: FuelBoardPeriodId; label: string }[] {
  const m = now.getMonth();
  const prev = m === 0 ? 11 : m - 1;
  return [
    { id: "oct", label: MO[m]! },
    { id: "sep", label: MO[prev]! },
    { id: "ytd", label: "YTD" },
  ];
}

/** @deprecated Prefer fuelBoardPeriodOptions() — static Oct/Sep lied vs live range (Codex F3). */
export const FUEL_BOARD_PERIOD_OPTIONS: { id: FuelBoardPeriodId; label: string }[] = fuelBoardPeriodOptions();
