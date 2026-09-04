import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
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

/** ~11px semibold tabular estimate; deterministic, no layout measure. */
const CHAR_PX = 7.2;
const BAR_PAD = 14;

export function plannerBarLabelTier(label: string, widthPx: number): string {
  const budget = Math.max(0, widthPx - BAR_PAD);
  const fits = (s: string) => s.length * CHAR_PX <= budget;
  if (!label) return "";
  if (fits(label)) return label;
  const parts = label.split(/[-/]/).filter(Boolean);
  const mid = parts.slice(-2).join("-");
  if (mid && fits(mid)) return mid;
  const tail = parts[parts.length - 1] ?? "";
  if (tail && fits(tail)) return tail;
  return "";
}

export type PlannerBarKind = "nb" | "sb" | "tr";

export type PlannerGridBar = {
  id: string;
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
  secondary?: ReactNode;
  unit?: ReactNode;
  action?: ReactNode;
  idle?: boolean;
  bars: PlannerGridBar[];
  dwells?: PlannerGridDwell[];
};

type Props = {
  days: string[];
  frozenLabel: string;
  actionLabel?: string;
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
            {isPlannerWeekend(s) ? <div className="pg-wash" style={{ left, width: dayPx }} /> : null}
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

function CellOrDash({ children }: { children: ReactNode }) {
  if (children == null || children === false || children === "") {
    return <span className="text-slate-400">—</span>;
  }
  return <>{children}</>;
}

function FrozenName({ row, hasActionColumn }: { row: PlannerGridRow; hasActionColumn: boolean }) {
  return (
    <div className={`pg-name pg-name-cols${hasActionColumn ? " has-action" : ""}`}>
      <div className="pg-col-name" title={typeof row.name === "string" ? row.name : undefined}>
        <CellOrDash>{row.name}</CellOrDash>
      </div>
      <div className="pg-col-sec"><CellOrDash>{row.secondary}</CellOrDash></div>
      <div className="pg-col-unit"><CellOrDash>{row.unit}</CellOrDash></div>
      {hasActionColumn ? (
        <div className="pg-col-action"><CellOrDash>{row.action}</CellOrDash></div>
      ) : null}
    </div>
  );
}

export function PlannerGrid({
  days,
  frozenLabel,
  actionLabel,
  frozenPx = 280,
  rows,
  empty,
  legend = false,
  testId,
  style,
}: Props) {
  const today = todayYmdAmericaChicago();
  const bands = plannerMonthBands(days);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [edge, setEdge] = useState({ left: false, right: false });
  const [drag, setDrag] = useState<{ active: boolean; startX: number; startScroll: number } | null>(null);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const hasActionColumn = actionLabel != null || rows.some((row) => row.action !== undefined);

  const dayPx = useMemo(() => {
    if (!measuredWidth || days.length === 0) return PLANNER_DAY_PX;
    const available = Math.max(0, measuredWidth - frozenPx);
    if (available <= 0) return PLANNER_DAY_PX;
    return Math.max(44, Math.min(120, Math.floor(available / days.length)));
  }, [measuredWidth, frozenPx, days.length]);
  const trackW = days.length * dayPx;

  const outside = useMemo(() => {
    let n = 0;
    for (const row of rows) {
      for (const bar of row.bars) {
        if ((rangeStart && bar.startYmd < rangeStart) || (rangeEnd && bar.endYmd > rangeEnd)) n += 1;
      }
    }
    return n;
  }, [rows, rangeStart, rangeEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || days.length === 0) return;
    setMeasuredWidth(el.clientWidth);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setMeasuredWidth(cr.width);
    }) : null;
    if (ro) ro.observe(el);

    const idx = Math.max(0, days.indexOf(today));
    const target = Math.max(0, idx * dayPx - el.clientWidth * 0.25);
    el.scrollLeft = target;
    const onScroll = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
    };
  }, [days, today, dayPx, rows.length, frozenPx]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      el.scrollLeft -= dayPx;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollLeft += dayPx;
    }
  };

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    setDrag({ active: true, startX: e.clientX, startScroll: el.scrollLeft });
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!drag?.active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
  };
  const onMouseUp = () => setDrag(null);

  const vars = {
    ["--frozen" as string]: `${frozenPx}px`,
    ["--day"]: `${dayPx}px`,
    ["--rowh"]: `${PLANNER_ROW_PX}px`,
    ...style,
  } as CSSProperties;

  return (
    <div className="planner-grid-canonical overflow-hidden rounded-sm border border-slate-300 bg-white" data-testid={testId} style={vars}>
      {outside > 0 ? (
        <button
          type="button"
          className="pg-outside"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollLeft = el.scrollWidth;
          }}
        >
          {outside} load{outside === 1 ? "" : "s"} outside this range →
        </button>
      ) : null}
      <div
        className={`pg-scroll${edge.left ? " fade-l" : ""}${edge.right ? " fade-r" : ""}`}
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="planner timeline"
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: drag?.active ? "grabbing" : "grab" }}
      >
        <div className="pg-grid">
          <div className="pg-axis" data-testid="planner-time-axis">
            <div className="pg-arow" data-testid="planner-axis-month-row">
              <div className={`pg-frz${hasActionColumn ? " pg-frz-cols has-action" : ""}`}>
                <span>{frozenLabel}</span>
                {hasActionColumn ? <span className="pg-frz-action">{actionLabel ?? "Action"}</span> : null}
              </div>
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
                <FrozenName row={row} hasActionColumn={hasActionColumn} />
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
                    const cl = Boolean(rangeStart && bar.startYmd < rangeStart);
                    const cr = Boolean(rangeEnd && bar.endYmd > rangeEnd);
                    const a = clampDayIndex(days, bar.startYmd);
                    const z = clampDayIndex(days, bar.endYmd);
                    const width = Math.max(24, (z - a + 1) * dayPx - 4);
                    const shown = plannerBarLabelTier(bar.label, width);
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
                        style={{ left: a * dayPx + 2, width }}
                        title={bar.label}
                        aria-label={bar.label}
                        onClick={bar.onClick}
                      >
                        {shown}
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
