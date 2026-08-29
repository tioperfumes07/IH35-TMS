import { useMemo } from "react";
import type { DispatchLoadRow } from "../../api/loads";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { loadSpanEndMs, loadSpanStartMs, orderedLegsForUnit, resolvedTripType, type TripKind } from "./roundTripsLegs";

const NB = "#1f2a44";
const SB = "#475569";
const TR = "#b45309";

const COLOR: Record<TripKind, string> = { NB, SB, TR };

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

type Props = {
  loads: DispatchLoadRow[];
  rangeFrom: string;
  rangeTo: string;
  onLoadClick: (id: string) => void;
};

export function RoundTripsTimeline({ loads, rangeFrom, rangeTo, onLoadClick }: Props) {
  const days = useMemo(() => dayList(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const rangeStart = Date.parse(`${rangeFrom}T00:00:00`);
  const rangeEnd = Date.parse(`${rangeTo}T23:59:59`);
  const spanMs = Math.max(1, rangeEnd - rangeStart);

  const byUnit = useMemo(() => {
    const map = new Map<string, DispatchLoadRow[]>();
    for (const load of loads) {
      if (!load.assigned_unit_id) continue;
      map.set(load.assigned_unit_id, [...(map.get(load.assigned_unit_id) ?? []), load]);
    }
    return [...map.entries()].sort((a, b) =>
      (a[1][0]?.assigned_unit_number ?? "").localeCompare(b[1][0]?.assigned_unit_number ?? "", undefined, { numeric: true })
    );
  }, [loads]);

  return (
    <div
      className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-sm border border-gray-200 bg-white"
      data-testid="round-trips-timeline"
      style={{ ["--dwl" as string]: "#94a3b8" }}
    >
      <div className="min-w-[720px]">
        <div
          className="sticky top-0 z-10 grid border-b border-gray-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
          style={{ gridTemplateColumns: `7rem repeat(${days.length}, minmax(2.5rem, 1fr))` }}
        >
          <div className="px-2 py-1">Unit</div>
          {days.map((d) => (
            <div key={d} className="border-l border-gray-100 px-0.5 py-1 text-center">
              {d.slice(5)}
            </div>
          ))}
        </div>
        {byUnit.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No assigned loads in this range.</div>
        ) : (
          byUnit.map(([unitId, unitLoads]) => {
            const chrono = [...unitLoads].sort((a, b) => loadSpanStartMs(a) - loadSpanStartMs(b));
            const legs = orderedLegsForUnit(unitLoads);
            return (
              <div
                key={unitId}
                className="relative border-b border-gray-100"
                style={{ minHeight: 40 + legs.length * 22 }}
                data-testid={`round-trips-timeline-unit-${unitId}`}
              >
                <div
                  className="grid"
                  style={{ gridTemplateColumns: `7rem repeat(${days.length}, minmax(2.5rem, 1fr))` }}
                >
                  <div className="truncate px-2 py-2 text-xs font-semibold text-gray-800">
                    <EntityLinkOrTombstone
                      kind="unit"
                      id={unitId}
                      name={unitLoads[0]?.assigned_unit_number}
                      noun="Unit"
                    />
                  </div>
                  <div className="relative min-h-10" style={{ gridColumn: `2 / span ${days.length}` }}>
                    {chrono.slice(0, -1).map((load, i) => {
                      const next = chrono[i + 1];
                      const gapStart = loadSpanEndMs(load);
                      const gapEnd = loadSpanStartMs(next);
                      if (!(gapEnd > gapStart)) return null;
                      const left = ((Math.max(gapStart, rangeStart) - rangeStart) / spanMs) * 100;
                      const width = ((Math.min(gapEnd, rangeEnd) - Math.max(gapStart, rangeStart)) / spanMs) * 100;
                      if (width <= 0) return null;
                      return (
                        <div
                          key={`dwell-${load.id}`}
                          data-testid="round-trips-dwell"
                          className="absolute top-1 h-3 rounded-sm"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.4)}%`,
                            background: "var(--dwl)",
                          }}
                          title="Dwell"
                        />
                      );
                    })}
                    {legs.map((load, li) => {
                      const kind = resolvedTripType(load, chrono.indexOf(load), chrono);
                      const start = loadSpanStartMs(load);
                      const end = loadSpanEndMs(load);
                      const longFlag = (kind === "NB" || kind === "SB") && end - start >= 7 * 24 * 60 * 60 * 1000;
                      const left = ((Math.max(start, rangeStart) - rangeStart) / spanMs) * 100;
                      const width = ((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / spanMs) * 100;
                      if (width <= 0) return null;
                      return (
                        <button
                          key={load.id}
                          type="button"
                          data-rt-trip-type={kind}
                          data-rt-long-leg={longFlag ? "1" : "0"}
                          className="absolute h-5 truncate rounded-sm px-1 text-left text-[10px] font-semibold text-white"
                          style={{
                            top: 14 + li * 20,
                            left: `${left}%`,
                            width: `${Math.max(width, 1.2)}%`,
                            backgroundColor: COLOR[kind],
                          }}
                          onClick={() => onLoadClick(load.id)}
                        >
                          <EntityLink
                            kind="load"
                            id={load.id}
                            label={entityLabel(load.load_number, load.id, "Load")}
                            className="text-white hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function defaultTimelineRange(): { from: string; to: string } {
  const to = companyToday();
  const from = addDaysIso(to, -13);
  return { from, to };
}
