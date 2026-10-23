import { useQuery } from "@tanstack/react-query";
import { listAllLoads, type DispatchLoadRow } from "../../../api/loads";
import type { PlannerBarKind, PlannerGridBar } from "./PlannerGrid";

function ymdFromIso(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  return iso.slice(0, 10);
}

// ROUND 20.6 S7: exported so callers building their own PlannerGridBar[] (e.g. UnifiedTimelinePlanner,
// which has to read trip_type from a separately-fetched richer load row) apply the identical
// nb/sb/tr normalization groupPlannerBarsByKey uses, instead of a second, possibly-diverging copy.
export function barKind(tripType: string | null | undefined): PlannerBarKind {
  const t = (tripType ?? "").toLowerCase();
  if (t === "nb" || t === "sb" || t === "tr") return t as PlannerBarKind;
  return "tr";
}

/** Pure: the load's planned span (pickup → delivery, YYYY-MM-DD); a missing end is the start. */
export function plannerLoadSpan(load: Pick<DispatchLoadRow, "pickup_scheduled_at" | "delivery_scheduled_at" | "scheduled_delivery_date">): { start: string | null; end: string | null } {
  const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
  const start = ymd(load.pickup_scheduled_at) ?? ymd(load.delivery_scheduled_at ?? load.scheduled_delivery_date);
  const end = ymd(load.delivery_scheduled_at ?? load.scheduled_delivery_date) ?? start;
  return { start, end };
}

/** Pure: LEAD 443.249 — a board load belongs on the planner when its span OVERLAPS the range (a load picked up before the
 *  range and delivered after it, or one with no planned date at all, is still on the truck — never dropped). */
export function plannerLoadInRange(load: Pick<DispatchLoadRow, "pickup_scheduled_at" | "delivery_scheduled_at" | "scheduled_delivery_date">, rangeStart: string, rangeEnd: string): boolean {
  const { start, end } = plannerLoadSpan(load);
  if (!start || !end) return true;
  return start <= rangeEnd && end >= rangeStart;
}

export function usePlannerLoads(operatingCompanyId: string, rangeStart: string, rangeEnd: string) {
  return useQuery({
    // LEAD 443.206 D1 — distinct from LoadsPlanner's week-events key (different row shape), same prefix.
    queryKey: ["dispatch", "planners", "loads", "rows", operatingCompanyId, rangeStart, rangeEnd],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      // LEAD 443.249 (owner: "Driver Planner shows 2 of 13 active loads"): the planners read THE board set (board_scope live —
      // the load service's membership, the same loads as List / Kanban / Truck Line), then keep the loads whose span
      // overlaps the range. Before: two date-filtered reads (pickup in range OR delivery in range) dropped every load that
      // spans the range and every load whose stops carry only an appointment.
      const board = await listAllLoads({ operating_company_id: [operatingCompanyId], board_scope: "live" });
      return board.loads
        .filter((load) => plannerLoadInRange(load, rangeStart, rangeEnd))
        .sort((a, b) => a.load_number.localeCompare(b.load_number));
    },
  });
}

/** LEAD 443.280-C — the bar's lane, from the load hub's first pickup / first delivery city ("Fort Morgan → Laredo"). */
export function plannerBarLane(load: Pick<DispatchLoadRow, "first_pickup_city" | "first_delivery_city">): string {
  return `${load.first_pickup_city || "Pickup unavailable"} → ${load.first_delivery_city || "Delivery unavailable"}`;
}

/** LEAD 443.280-C — "$3,000 · 1,075 mi · $2.79/mi": the load's rate, the load hub's practical miles, and rate per mile.
 *  No practical miles = "— mi" and no $/mi (never a divide by a guess). */
export function plannerBarMoneyDetail(load: Pick<DispatchLoadRow, "rate_total_cents" | "currency_code" | "miles_practical">): string {
  const cents = Number(load.rate_total_cents ?? 0);
  const whole = cents % 100 === 0;
  const money =
    load.currency_code === "USD"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100)
      : `${load.currency_code} ${(cents / 100).toFixed(2)}`;
  const miles = Number(load.miles_practical ?? 0);
  if (!(miles > 0)) return `${money} · — mi`;
  const perMile = `${load.currency_code === "USD" ? "$" : `${load.currency_code} `}${(cents / 100 / miles).toFixed(2)}/mi`;
  return `${money} · ${Math.round(miles).toLocaleString("en-US")} mi · ${perMile}`;
}

export function groupPlannerBarsByKey(
  loads: DispatchLoadRow[],
  days: string[],
  getKey: (load: DispatchLoadRow) => string | null | undefined,
): Map<string, PlannerGridBar[]> {
  const groups = new Map<string, PlannerGridBar[]>();
  const fallbackDay = days[0] ?? "1970-01-01";
  for (const load of loads) {
    const key = getKey(load);
    if (!key) continue;
    const start = ymdFromIso(load.pickup_scheduled_at, fallbackDay);
    const end = ymdFromIso(load.delivery_scheduled_at ?? load.scheduled_delivery_date, start);
    const bar: PlannerGridBar = {
      id: `${load.id}-${key}`,
      loadId: load.id,
      label: load.load_number,
      startYmd: start,
      endYmd: end,
      kind: barKind(load.trip_type),
      testId: `planner-bar-${load.load_number}`,
      tripType: load.trip_type ?? undefined,
    };
    const list = groups.get(key) ?? [];
    list.push(bar);
    groups.set(key, list);
  }
  return groups;
}
