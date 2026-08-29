import type { DispatchLoadRow } from "../../api/loads";

export type TripKind = "NB" | "TR" | "SB";

export const RT_KANBAN_CARD_CLASS =
  "relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm";

export const RT_KANBAN_COL_MIN = {
  compact: "min-w-[200px]",
  standard: "min-w-[230px]",
  comfortable: "min-w-[290px]",
} as const;

/** Pairing order only — not city geography. Untyped: first=NB, last=SB, middle=TR. */
export function resolvedTripType(load: DispatchLoadRow, index: number, unitLoadsChrono: DispatchLoadRow[]): TripKind {
  if (load.trip_type === "NB" || load.trip_type === "TR" || load.trip_type === "SB") return load.trip_type;
  if (unitLoadsChrono.length === 1) return "NB";
  if (index === 0) return "NB";
  if (index === unitLoadsChrono.length - 1) return "SB";
  return "TR";
}

export function orderedLegsForUnit(unitLoads: DispatchLoadRow[]): DispatchLoadRow[] {
  const chrono = [...unitLoads].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const tagged = chrono.map((load, i) => ({ load, kind: resolvedTripType(load, i, chrono) }));
  const nb = tagged.filter((x) => x.kind === "NB").map((x) => x.load);
  const tr = tagged.filter((x) => x.kind === "TR").map((x) => x.load);
  const sb = tagged.filter((x) => x.kind === "SB").map((x) => x.load);
  return [...nb, ...tr, ...sb];
}

export function loadSpanStartMs(load: DispatchLoadRow): number {
  return Date.parse(load.created_at);
}

export function loadSpanEndMs(load: DispatchLoadRow): number {
  const raw =
    load.effective_delivery_date ||
    load.scheduled_delivery_date ||
    load.delivery_scheduled_at ||
    load.updated_at ||
    load.created_at;
  const t = Date.parse(raw);
  const start = loadSpanStartMs(load);
  if (Number.isNaN(t) || t < start) return start + 24 * 60 * 60 * 1000;
  return t;
}
