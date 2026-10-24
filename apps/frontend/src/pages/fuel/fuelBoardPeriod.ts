/** ROUND 443.282 — board period windows (Fuel.dc.html Oct / Sep / YTD). */
export type FuelBoardPeriodId = "oct" | "sep" | "ytd";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatShortRange(from: Date, to: Date) {
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${mo[from.getMonth()]} ${from.getDate()}–${to.getDate()}`;
  }
  return `${mo[from.getMonth()]} ${from.getDate()} – ${mo[to.getMonth()]} ${to.getDate()}`;
}

export function fuelBoardPeriodRange(period: FuelBoardPeriodId, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "ytd") {
    const from = new Date(y, 0, 1);
    return { from: isoDate(from), to: isoDate(now), labelSuffix: `Jan 1–${now.getDate()}` };
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

export const FUEL_BOARD_PERIOD_OPTIONS: { id: FuelBoardPeriodId; label: string }[] = [
  { id: "oct", label: "Oct" },
  { id: "sep", label: "Sep" },
  { id: "ytd", label: "YTD" },
];
