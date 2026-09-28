/**
 * ROUND 155.6 — Truck Line top-level grouping.
 *
 * A unit_id appears in at most ONE top-level group. Tour legs stack under that one group.
 * Guard scripts/verify-truck-line-unit-top-level-unique.mjs fails if this invariant is broken.
 */

export type TruckLineSection = "tour" | "in_transit" | "available";

export type TruckLineLegInput = {
  unit_id: string;
  unit_number: string;
  load_id: string | null;
  trip_type: string | null;
  tour_id: string | null;
  tour_display_id: string | null;
  created_at?: string | null;
  /** Full loaded/available row payload attached after grouping. */
  row: unknown;
};

export type TruckLineUnitGroup<T = unknown> = {
  section: TruckLineSection;
  unit_id: string;
  unit_number: string;
  /** P-series from driver_finance.driver_settlements.display_id — never a UUID. */
  tour_display_id: string | null;
  legs: T[];
};

const LEG_RANK: Record<string, number> = { NB: 0, TR: 1, SB: 2, LOCAL: 3 };

function legSortKey(leg: TruckLineLegInput): string {
  const rank = LEG_RANK[leg.trip_type ?? ""] ?? 9;
  return `${rank}:${leg.created_at ?? ""}:${leg.load_id ?? ""}`;
}

function assertUniqueUnitIds(groups: { unit_id: string }[]): void {
  const seen = new Set<string>();
  for (const g of groups) {
    if (seen.has(g.unit_id)) {
      throw new Error(`truck_line_duplicate_top_level_unit:${g.unit_id}`);
    }
    seen.add(g.unit_id);
  }
}

/**
 * Group CURRENT loaded legs + available rows into top-level unit groups.
 * Section order when rendering: tour → in_transit → available.
 */
export function groupTruckLineByUnit<T>(
  loadedLegs: Array<TruckLineLegInput & { row: T }>,
  availableRows: Array<{ unit_id: string; unit_number: string; row: T }>
): TruckLineUnitGroup<T>[] {
  const byUnit = new Map<string, Array<TruckLineLegInput & { row: T }>>();
  for (const leg of loadedLegs) {
    const list = byUnit.get(leg.unit_id) ?? [];
    list.push(leg);
    byUnit.set(leg.unit_id, list);
  }

  const tour: TruckLineUnitGroup<T>[] = [];
  const inTransit: TruckLineUnitGroup<T>[] = [];

  for (const [unitId, legs] of byUnit) {
    legs.sort((a, b) => legSortKey(a).localeCompare(legSortKey(b)));
    const onTour = legs.some((l) => Boolean(l.tour_id) || Boolean(l.tour_display_id));
    const tourDisplay =
      legs.map((l) => l.tour_display_id).find((d) => d && /^P-\d+$/i.test(d)) ??
      legs.map((l) => l.tour_display_id).find(Boolean) ??
      null;
    // Never surface a UUID as the tour number.
    const safeTour =
      tourDisplay && /^P-\d+$/i.test(tourDisplay) ? tourDisplay : tourDisplay && !/^[0-9a-f-]{36}$/i.test(tourDisplay) ? tourDisplay : null;

    const group: TruckLineUnitGroup<T> = {
      section: onTour ? "tour" : "in_transit",
      unit_id: unitId,
      unit_number: legs[0]?.unit_number ?? "",
      tour_display_id: onTour ? safeTour : null,
      legs: legs.map((l) => l.row),
    };
    if (onTour) tour.push(group);
    else inTransit.push(group);
  }

  const loadedUnitIds = new Set(byUnit.keys());
  const available: TruckLineUnitGroup<T>[] = [];
  for (const a of availableRows) {
    if (loadedUnitIds.has(a.unit_id)) continue; // never duplicate a unit that already has a load
    available.push({
      section: "available",
      unit_id: a.unit_id,
      unit_number: a.unit_number,
      tour_display_id: null,
      legs: [a.row],
    });
  }

  const sortByUnit = (a: TruckLineUnitGroup<T>, b: TruckLineUnitGroup<T>) =>
    a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true });
  tour.sort(sortByUnit);
  inTransit.sort(sortByUnit);
  available.sort(sortByUnit);

  const groups = [...tour, ...inTransit, ...available];
  assertUniqueUnitIds(groups);
  return groups;
}

/** Pure check used by the static/unit guard — returns duplicate unit_ids if any. */
export function findDuplicateTopLevelUnitIds(groups: { unit_id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const g of groups) {
    if (seen.has(g.unit_id)) dupes.push(g.unit_id);
    else seen.add(g.unit_id);
  }
  return dupes;
}
