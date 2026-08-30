import type { CSSProperties, ReactNode } from "react";
import "./PlannerGrid.css";
import {
  formatPlannerDwell,
  isPlannerMonday,
  isPlannerMonthStart,
  isPlannerWeekend,
  plannerMonthBands,
  plannerWeekdayShort,
  todayYmdAmericaChicago,
} from "./plannerTimeAxis";

/** Fixed day column — never content-sized. GO-PLANNER-01. */
export const PLANNER_DAY_PX = 52;
export const PLANNER_ROW_PX = 34;

export type PlannerBarKind = "nb" | "sb" | "tr";

export type PlannerGridBar = {
  id: string;
  /** Canonical load uuid for A4 — one element per load. Defaults to id. */
  loadId?: string;
  label: string;
  startYmd: string;
  endYmd: string;
  kind: PlannerBarKind;
  onClick?: () => void;
  testId?: string;
  tripType?: string;
  longLeg?: boolean;
};

export type PlannerGridDwell = {
  id: string;
  startYmd: string;
  endYmd: string;
  label: string;
  testId?: string;
};

export type PlannerGridRow = {
  id: string;
  name: ReactNode;
  idle?: boolean;
  bars: PlannerGridBar[];
  dwells?: PlannerGridDwell[];
};

type Props = {
  days: string[];
  frozenLabel: string;
  frozenPx?: number;
  rows: PlannerGridRow[];
  empty: ReactNode;
  legend?: boolean;
  testId?: string;
  style?: CSSProperties;
};

export function ymdFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function clampDayIndex(days: string[], ymd: string): number {
  const i = days.indexOf(ymd);
  if (i >= 0) return i;
  if (days.length === 0) return 0;
  if (ymd < days[0]) return 0;
  return days.length - 1;
}

export function dwellLabelFromMs(startMs: number, endMs: number): string {
  const raw = formatPlannerDwell(new Date(startMs).toISOString(), new Date(endMs).toISOString());
  return raw ? `${raw} idle` : "idle";
}

/** Consecutive days matching `kindFor` → labelled dwells (leave / shop), never per-day cell text. */
export function dwellsFromDayMap(
  days: string[],
  kindFor: (ymd: string) => string | undefined,
  idPrefix: string
): PlannerGridDwell[] {
  const out: PlannerGridDwell[] = [];
  let i = 0;
  while (i < days.length) {
    const kind = kindFor(days[i]);
    if (!kind) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && kindFor(days[j + 1]) === kind) j += 1;
    const start = days[i];
    const endExclusive = days[j];
    const endIso = `${endExclusive}T23:59:59Z`;
    const dur = formatPlannerDwell(`${start}T00:00:00Z`, endIso);
    out.push({
      id: `${idPrefix}-${start}`,
      startYmd: start,
      endYmd: endExclusive,
      label: dur ? `${kind} · ${dur}` : kind,
    });
    i = j + 1;
  }
  return out;
}

function TrackOverlays({ days, today, dayPx }: { days: string[]; today: string; dayPx: number }) {
  return (
    <>
      {days.map((s, i) => {
        const left = i * dayPx;
        return (
          <span key={s}>
            {isPlannerWeekend(s) ? (
              <div className="pg-wash" style={{ left, width: dayPx }} />
            ) : null}
            {isPlannerMonthStart(s) ? (
              <div className="pg-mrule" style={{ left }} />
            ) : isPlannerMonday(s) ? (
              <div className="pg-wrule" style={{ left }} />
            ) : null}
            {s === today ? <div className="pg-tnow" style={{ left }} /> : null}
          </span>
        );
      })}
    </>
  );
}

export function PlannerGrid({
  days,
  frozenLabel,
  frozenPx = 180,
  rows,
  empty,
  legend = false,
  testId,
  style,
}: Props) {
  const today = todayYmdAmericaChicago();
  const bands = plannerMonthBands(days);
  const dayPx = PLANNER_DAY_PX;
  const trackW = days.length * dayPx;
  const vars = {
    ["--frozen" as string]: `${frozenPx}px`,
    ["--day"]: `${dayPx}px`,
    ["--rowh"]: `${PLANNER_ROW_PX}px`,
    ...style,
  } as CSSProperties;

  return (
    <div className="planner-grid-canonical overflow-hidden rounded-sm border border-slate-300 bg-white" data-testid={testId} style={vars}>
      <div className="pg-scroll">
        <div className="pg-grid">
          <div className="pg-axis" data-testid="planner-time-axis">
            <div className="pg-arow" data-testid="planner-axis-month-row">
              <div className="pg-frz">{frozenLabel}</div>
              {bands.map((b) => (
                <div
                  key={b.key}
                  className="pg-mon"
                  style={{ width: b.span * dayPx, flex: `0 0 ${b.span * dayPx}px` }}
                >
                  {b.label}
                </div>
              ))}
            </div>
            <div className="pg-arow" data-testid="planner-axis-day-row">
              <div className="pg-frz" />
              {days.map((s) => {
                const mo = isPlannerMonthStart(s);
                const wk = isPlannerMonday(s);
                return (
                  <div
                    key={s}
                    className={`pg-dh${mo ? " mo" : wk ? " wk" : ""}${isPlannerWeekend(s) ? " we" : ""}${s === today ? " today" : ""}`}
                  >
                    <span className="w">{plannerWeekdayShort(s)}</span>
                    <span className="n">{Number(s.slice(8, 10))}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="pg-empty">{empty}</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className={`pg-r${row.idle ? " idle" : ""}`}>
                <div className="pg-name">{row.name}</div>
                <div
                  className="pg-track"
                  data-testid="planner-grid-track"
                  data-contract="planner-grid-track"
                  style={{
                    width: trackW,
                    backgroundImage:
                      "repeating-linear-gradient(to right, var(--rule-day) 0 1px, transparent 1px var(--day))",
                  }}
                >
                  <TrackOverlays days={days} today={today} dayPx={dayPx} />
                  {(row.dwells ?? []).map((w) => {
                    const a = clampDayIndex(days, w.startYmd);
                    const b = clampDayIndex(days, w.endYmd);
                    return (
                      <div
                        key={w.id}
                        className="pg-dwell"
                        data-testid={w.testId ?? "planner-grid-dwell"}
                        title={w.label}
                        style={{ left: a * dayPx + 3, width: Math.max(4, (b - a + 1) * dayPx - 6) }}
                      >
                        <i>{w.label}</i>
                      </div>
                    );
                  })}
                  {row.bars.map((bar) => {
                    const rangeStart = days[0];
                    const rangeEnd = days[days.length - 1];
                    const cl = Boolean(rangeStart && bar.startYmd < rangeStart);
                    const cr = Boolean(rangeEnd && bar.endYmd > rangeEnd);
                    const a = clampDayIndex(days, bar.startYmd);
                    const z = clampDayIndex(days, bar.endYmd);
                    const cls = `pg-bar ${bar.kind}${cl ? " cl" : ""}${cr ? " cr" : ""}`;
                    return (
                      <button
                        key={bar.id}
                        type="button"
                        className={cls}
                        data-testid={bar.testId}
                        data-load-id={bar.loadId ?? bar.id}
                        data-rt-trip-type={bar.tripType}
                        data-rt-long-leg={bar.longLeg ? "1" : "0"}
                        style={{ left: a * dayPx + 2, width: Math.max(8, (z - a + 1) * dayPx - 4) }}
                        title={bar.label}
                        onClick={bar.onClick}
                      >
                        {bar.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {legend ? (
        <div className="pg-legend">
          <span>NB / SB / TR = load number only</span>
          <span>Hatched = dwell, always labelled</span>
          <span>Torn edge = trip continues past the range</span>
        </div>
      ) : null}
    </div>
  );
}
