/** Pure grouping helpers shared by the report boards (week = Monday start, as the boards' "Week of 10/19"). */
import { addDaysIso } from "../../../lib/businessDate";

export function weekStartIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysIso(iso.slice(0, 10), -(dow === 0 ? 6 : dow - 1));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export function sumBy<T>(rows: readonly T[], value: (row: T) => number | null | undefined): number {
  return rows.reduce((s, r) => s + (Number(value(r)) || 0), 0);
}

export function pct(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

export function pctLabel(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}
