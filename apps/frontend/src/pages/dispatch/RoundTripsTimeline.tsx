import { useMemo } from "react";
import type { DispatchLoadRow } from "../../api/loads";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import {
  dwellLabelFromMs,
  PlannerGrid,
  ymdFromMs,
  type PlannerBarKind,
  type PlannerGridDwell,
  type PlannerGridRow,
} from "./planners/PlannerGrid";
import {
  loadSpanEndMs,
  loadSpanStartMs,
  orderedLegsForUnit,
  resolvedTripType,
  RT_PAIRING_ACTIVE_STATUSES,
  type TripKind,
} from "./roundTripsLegs";

const ACTIVE_LOAD = new Set<string>(RT_PAIRING_ACTIVE_STATUSES);

function dayList(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cur = fromIso;
  for (let i = 0; i < 60; i += 1) {
    out.push(cur);
    if (cur === toIso) break;
    cur = addDaysIso(cur, 1);
  }
  return out;
}

function kindCss(k: TripKind): PlannerBarKind {
  if (k === "SB") return "sb";
  if (k === "TR") return "tr";
  return "nb";
}

type Props = {
  loads: DispatchLoadRow[];
  rangeFrom: string;
  rangeTo: string;
  onLoadClick: (id: string) => void;
};

export function RoundTripsTimeline({ loads, rangeFrom, rangeTo, onLoadClick }: Props) {
  const days = useMemo(() => dayList(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

  const rows: PlannerGridRow[] = useMemo(() => {
    const map = new Map<string, DispatchLoadRow[]>();
    for (const load of loads) {
      if (!load.assigned_unit_id) continue;
      if (!ACTIVE_LOAD.has(load.status)) continue;
      map.set(load.assigned_unit_id, [...(map.get(load.assigned_unit_id) ?? []), load]);
    }
    const units = [...map.entries()].sort((a, b) =>
      (a[1][0]?.assigned_unit_number ?? "").localeCompare(b[1][0]?.assigned_unit_number ?? "", undefined, {
        numeric: true,
      })
    );
    return units.map(([unitId, unitLoads]) => {
      const chrono = [...unitLoads].sort((a, b) => loadSpanStartMs(a) - loadSpanStartMs(b));
      const legs = orderedLegsForUnit(unitLoads);
      const dwells: PlannerGridDwell[] = [];
      for (let i = 0; i < chrono.length - 1; i += 1) {
        const load = chrono[i];
        const next = chrono[i + 1];
        const gapStart = loadSpanEndMs(load);
        const gapEnd = loadSpanStartMs(next);
        if (!(gapEnd > gapStart)) continue;
        dwells.push({
          id: `dwell-${load.id}`,
          startYmd: ymdFromMs(gapStart),
          endYmd: ymdFromMs(gapEnd),
          label: dwellLabelFromMs(gapStart, gapEnd),
          testId: "round-trips-dwell",
        });
      }
      return {
        id: unitId,
        name: (
          <EntityLinkOrTombstone
            kind="unit"
            id={unitId}
            name={unitLoads[0]?.assigned_unit_number}
            noun="Unit"
          />
        ),
        idle: legs.length === 0,
        dwells,
        bars: legs.map((load) => {
          const kind = resolvedTripType(load, chrono.indexOf(load), chrono);
          const start = loadSpanStartMs(load);
          const end = loadSpanEndMs(load);
          const longFlag = (kind === "NB" || kind === "SB") && end - start >= 7 * 24 * 60 * 60 * 1000;
          return {
            id: load.id,
            label: load.load_number || load.id,
            startYmd: ymdFromMs(start),
            endYmd: ymdFromMs(end),
            kind: kindCss(kind),
            tripType: kind,
            longLeg: longFlag,
            onClick: () => onLoadClick(load.id),
          };
        }),
      };
    });
  }, [loads, onLoadClick]);

  return (
    <PlannerGrid
      /* --dwl: dwell hatch token; sibling guard verify-roundtrips-quality-load-entitylink */
      style={{ ["--dwl" as string]: "#cbd5e1" }}
      testId="round-trips-timeline"
      days={days}
      frozenLabel="Unit"
      legend
      rows={rows}
      empty="No assigned loads in this range."
    />
  );
}

export function defaultTimelineRange(): { from: string; to: string } {
  const to = companyToday();
  const from = addDaysIso(to, -13);
  return { from, to };
}
