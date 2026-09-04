import { useQuery } from "@tanstack/react-query";
import { listAllLoads, type DispatchLoadRow } from "../../../api/loads";
import type { PlannerBarKind, PlannerGridBar } from "./PlannerGrid";

function ymdFromIso(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  return iso.slice(0, 10);
}

function barKind(tripType: string | null | undefined): PlannerBarKind {
  const t = (tripType ?? "").toLowerCase();
  if (t === "nb" || t === "sb" || t === "tr") return t as PlannerBarKind;
  return "tr";
}

export function usePlannerLoads(operatingCompanyId: string, rangeStart: string, rangeEnd: string) {
  return useQuery({
    queryKey: ["dispatch", "planners", "loads", operatingCompanyId, rangeStart, rangeEnd],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const [byPickup, byDelivery] = await Promise.all([
        listAllLoads({
          operating_company_id: [operatingCompanyId],
          board_scope: "live",
          pickup_date_from: rangeStart,
          pickup_date_to: rangeEnd,
        }),
        listAllLoads({
          operating_company_id: [operatingCompanyId],
          board_scope: "live",
          delivery_date_from: rangeStart,
          delivery_date_to: rangeEnd,
        }),
      ]);
      const map = new Map<string, DispatchLoadRow>();
      for (const load of byPickup.loads) map.set(load.id, load);
      for (const load of byDelivery.loads) map.set(load.id, load);
      return [...map.values()].sort((a, b) => a.load_number.localeCompare(b.load_number));
    },
  });
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
