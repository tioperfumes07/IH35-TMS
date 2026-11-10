import { companyToday, localDateFromIso } from "../../lib/businessDate";

/** Board period IDs are legacy keys; labels follow the actual business month. */
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
  now = localDateFromIso(companyToday(now));
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "ytd") {
    const from = new Date(y, 0, 1);
    return { from: isoDate(from), to: isoDate(now), labelSuffix: formatShortRange(from, now) };
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

export function fuelBoardPeriodOptions(now = new Date()): { id: FuelBoardPeriodId; label: string }[] {
  const month = (id: FuelBoardPeriodId) => fuelBoardPeriodRange(id, now).labelSuffix.split(" ")[0];
  return [
    { id: "oct", label: month("oct") },
    { id: "sep", label: month("sep") },
    { id: "ytd", label: "YTD" },
  ];
}
