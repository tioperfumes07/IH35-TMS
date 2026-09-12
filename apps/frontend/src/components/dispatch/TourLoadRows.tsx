// DISPATCH-ONE-ROW-PER-LOAD (owner 2026-09-11, Cursor handoff item 3 taken over by Claude Lead):
// the Load-Costs Pre-Settlement / Settlement registers project ONE ROW PER LOAD — the load number
// sits immediately next to the settlement/tour number (COLUMN-ORDERING LAW 2026-09-11), and each row
// carries that load's own revenue / costs / driver pay / margin / miles from the same buildTourReadout
// leg numbers. The tour-level cells (driver, unit, started/closed, readiness, driver net, company
// settlement) repeat on every leg row of the tour; the footer sums per-load money, which equals the
// tour totals exactly because a tour's totals are the sum of its live legs (no second sum).
//
// DISPATCH-NO-HISTORY (owner 2026-09-11: "only current pre settlements, and all those loads related
// to it … nothing historical"): the rows are whatever /driver-finance/tours returns — the backend has
// already dropped cancelled legs, legs settled on another locked settlement, and open tours with no
// live leg. This file never re-derives; it only flattens.
import { Link } from "react-router-dom";
import type { ParityColumn } from "../parity/ParityTable";
import type { TourListRow } from "../../api/tourReadout";
import { EntityLink } from "../shared/EntityLink";
import { mmmDd } from "../../lib/formatDate";
import { settlementLabel } from "../../lib/settlementNumber";
import { legPillClass } from "./TourLegsCell";

const DASH = "—";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (c: number) => money.format(c / 100);

export type TourLoadRow = TourListRow & {
  /** `${settlement_id}:${load_id}` — unique per row; the tour's settlement_id stays on the row for expand/link. */
  row_key: string;
  load_id: string;
  load_number: string;
  trip_type: string | null;
  load_status: string;
  lane: string;
  pickup_date: string | null;
  delivery_date: string | null;
  load_revenue_cents: number;
  load_costs_cents: number;
  load_driver_pay_cents: number;
  load_margin_cents: number;
  load_margin_pct: number | null;
  load_miles_practical: number | null;
  load_miles_real: number | null;
  /** 1-based position of this leg in its tour (NB→TR→SB order the readout already gives). */
  leg_index: number;
};

/** One tour row → N load rows (one per live leg). A tour with zero live legs yields no row: the backend
 *  already excludes it for open tours; for closed tours it would be an empty settlement — surfaced as a
 *  single row with a dash load so it is never silently hidden. */
export function flattenTourRows(rows: TourListRow[]): TourLoadRow[] {
  const out: TourLoadRow[] = [];
  for (const t of rows) {
    const legs = t.legs ?? [];
    if (legs.length === 0) {
      out.push({
        ...t, row_key: `${t.settlement_id}:none`, load_id: "", load_number: DASH, trip_type: null, load_status: "", lane: "",
        pickup_date: null, delivery_date: null, load_revenue_cents: 0, load_costs_cents: 0, load_driver_pay_cents: 0, load_margin_cents: 0,
        load_margin_pct: null, load_miles_practical: null, load_miles_real: null, leg_index: 0,
      });
      continue;
    }
    legs.forEach((l, i) => {
      out.push({
        ...t, row_key: `${t.settlement_id}:${l.load_id}`, load_id: l.load_id, load_number: l.load_number, trip_type: l.trip_type, load_status: l.status,
        lane: l.lane, pickup_date: l.pickup_date, delivery_date: l.delivery_date,
        load_revenue_cents: l.revenue_cents, load_costs_cents: l.costs_cents, load_driver_pay_cents: l.driver_pay_cents,
        load_margin_cents: l.margin_cents, load_margin_pct: l.margin_pct, load_miles_practical: l.miles_practical, load_miles_real: l.miles_real,
        leg_index: i + 1,
      });
    });
  }
  return out;
}

const neg = (c: number) => (c < 0 ? "text-[#991B1B]" : undefined);
const MONEY = "whitespace-nowrap text-right tabular-nums";

export function TOUR_LOAD_COLUMNS(state: "open" | "closed"): ParityColumn<TourLoadRow>[] {
  return [
    // SETTLEMENT-NUMBER-IS-ALWAYSTRACK-DOC: the AlwaysTrack 4-digit doc, "Open" while the tour is open, never S-YYYY-NNNN.
    { key: "tour", label: "Settlement/Tour", alwaysVisible: true, testId: "tour-col-id", sortable: true, className: "whitespace-nowrap", minWidth: 90,
      sortValue: r => settlementLabel(r), render: r => <Link className="ldt-link font-semibold" style={{ display: "inline" }} to={`/driver-finance/settlements?settlement_id=${encodeURIComponent(r.settlement_id)}`}>{settlementLabel(r)}</Link> },
    // COLUMN-ORDERING LAW (owner 2026-09-11): Load renders immediately next to Settlement — this row's ONE load.
    { key: "load_number", label: "Load Number", alwaysVisible: true, testId: "tour-col-load-number", sortable: true, className: "whitespace-nowrap", minWidth: 110, maxWidth: 160,
      sortValue: r => r.load_number, exportValue: r => r.load_number,
      render: r => r.load_id ? <EntityLink kind="load" id={r.load_id} label={`${r.trip_type ?? "?"} ${r.load_number}`} className={legPillClass(r.trip_type)} title={r.lane || r.load_number} /> : <span className="ldt-muted">{DASH}</span> },
    { key: "trip_type", label: "Trip type", testId: "tour-col-trip-type", sortable: true, minWidth: 60, maxWidth: 80, sortValue: r => r.trip_type ?? "", render: r => r.trip_type ?? DASH },
    { key: "leg_index", label: "Leg", headerTitle: "Position of this load in its tour (NB → TR → SB)", testId: "tour-col-leg", sortable: true, minWidth: 56, maxWidth: 72, cellClass: "whitespace-nowrap tabular-nums",
      sortValue: r => r.leg_index, render: r => r.leg_index ? `${r.leg_index} of ${r.leg_count}` : DASH },
    { key: "lane", label: "Lane", testId: "tour-col-lane", sortable: true, minWidth: 140, maxWidth: 260, cellClass: "whitespace-nowrap", sortValue: r => r.lane, render: r => <span className="block max-w-[260px] truncate" title={r.lane}>{r.lane || DASH}</span> },
    { key: "driver", label: "Driver", testId: "tour-col-driver", sortable: true, minWidth: 120, maxWidth: 200, cellClass: "whitespace-nowrap", sortValue: r => r.driver_name ?? "", render: r => <span className="block max-w-[200px] truncate" title={r.driver_name ?? ""}>{r.driver_name ?? DASH}</span> },
    { key: "unit", label: "Unit", testId: "tour-col-unit", sortable: true, minWidth: 56, maxWidth: 64, className: "whitespace-nowrap", sortValue: r => r.unit_number ?? "", render: r => r.unit_number ?? DASH },
    { key: "pickup", label: "Pickup", testId: "tour-col-pickup", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: r => r.pickup_date ?? "", render: r => r.pickup_date ? mmmDd(r.pickup_date) : DASH },
    { key: "delivery", label: "Delivery", testId: "tour-col-delivery", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: r => r.delivery_date ?? "", render: r => r.delivery_date ? mmmDd(r.delivery_date) : DASH },
    { key: "started", label: "Tour started", testId: "tour-col-started", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: r => r.trip_started_at ?? "", render: r => r.trip_started_at ? mmmDd(r.trip_started_at) : DASH },
    ...(state === "closed" ? [{ key: "closed", label: "Closed", testId: "tour-col-closed", sortable: true, className: "whitespace-nowrap", minWidth: 88, maxWidth: 112, sortValue: (r: TourLoadRow) => r.trip_closed_at ?? "", render: (r: TourLoadRow) => r.trip_closed_at ? mmmDd(r.trip_closed_at) : DASH } as ParityColumn<TourLoadRow>] : []),
    { key: "revenue", label: "Revenue", testId: "tour-col-revenue", sortable: true, cellClass: MONEY, minWidth: 100, maxWidth: 140, sortValue: r => r.load_revenue_cents, render: r => fmt(r.load_revenue_cents) },
    { key: "costs", label: "Costs", testId: "tour-col-costs", sortable: true, cellClass: MONEY, minWidth: 100, maxWidth: 140, sortValue: r => r.load_costs_cents, render: r => fmt(r.load_costs_cents) },
    { key: "driver_pay", label: "Driver pay", testId: "tour-col-driver-pay", sortable: true, cellClass: MONEY, minWidth: 100, maxWidth: 140, sortValue: r => r.load_driver_pay_cents, render: r => fmt(r.load_driver_pay_cents) },
    { key: "tour_margin", label: "Margin", testId: "tour-col-margin", sortable: true, cellClass: MONEY, minWidth: 100, maxWidth: 140, sortValue: r => r.load_margin_cents, render: r => <span className={neg(r.load_margin_cents)}>{fmt(r.load_margin_cents)}</span> },
    { key: "tour_margin_pct", label: "Margin %", testId: "tour-col-margin-pct", sortable: true, cellClass: MONEY, minWidth: 76, maxWidth: 100, sortValue: r => r.load_margin_pct ?? -Infinity, render: r => r.load_margin_pct == null ? DASH : <span className={neg(r.load_margin_pct)}>{r.load_margin_pct.toFixed(1)}%</span> },
    { key: "miles_practical", label: "Practical miles", testId: "tour-col-miles_practical", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: r => r.load_miles_practical ?? -Infinity, render: r => r.load_miles_practical == null ? DASH : r.load_miles_practical.toLocaleString("en-US") },
    { key: "miles_real", label: "Real miles", testId: "tour-col-miles_real", sortable: true, cellClass: "whitespace-nowrap tabular-nums", sortValue: r => r.load_miles_real ?? -Infinity, render: r => r.load_miles_real == null ? DASH : r.load_miles_real.toLocaleString("en-US") },
    ...(state === "open" ? [
      { key: "ready_ok", label: "Checks passed", testId: "tour-col-checks-passed", sortable: true, sortValue: (r: TourLoadRow) => r.ready_ok, render: (r: TourLoadRow) => r.ready_ok } as ParityColumn<TourLoadRow>,
      { key: "ready_total", label: "Checks required", testId: "tour-col-checks-required", sortable: true, sortValue: (r: TourLoadRow) => r.ready_total, render: (r: TourLoadRow) => r.ready_total } as ParityColumn<TourLoadRow>,
      { key: "close_blockers", label: "Open items", testId: "tour-col-open-items", sortable: true, sortValue: (r: TourLoadRow) => r.close_blockers.join(", "), render: (r: TourLoadRow) => r.close_blockers.length ? <span className="flex flex-col">{r.close_blockers.map(item => <span key={item}>{item}</span>)}</span> : DASH } as ParityColumn<TourLoadRow>,
      { key: "ready", label: "Ready to close", testId: "tour-col-ready", sortable: true, minWidth: 120, maxWidth: 200, sortValue: (r: TourLoadRow) => r.ready_ok, render: (r: TourLoadRow) => <span className={`ldt-pill ${r.can_close ? "ok" : r.ready_ok === 0 ? "bad" : "warn"}`} title={r.close_blockers.join("\n")}>{r.can_close ? "Ready" : "Not ready"}</span> } as ParityColumn<TourLoadRow>,
    ] : [
      { key: "net", label: "Driver net", headerTitle: "Tour-level: the driver's net for the whole settlement", testId: "tour-col-driver-net", sortable: true, cellClass: MONEY, minWidth: 100, maxWidth: 140, sortValue: (r: TourLoadRow) => r.driver_net_cents ?? 0, render: (r: TourLoadRow) => r.driver_net_cents == null ? DASH : fmt(r.driver_net_cents) } as ParityColumn<TourLoadRow>,
      { key: "company", label: "Company settlement", testId: "tour-col-company", minWidth: 120, maxWidth: 160, cellClass: "whitespace-nowrap", render: (r: TourLoadRow) => r.company_settlement_display_id ? r.company_settlement_display_id : <span className="ldt-pill warn" data-testid="tour-company-not-opened">not opened</span> } as ParityColumn<TourLoadRow>,
    ]),
  ];
}

/** Footer: per-load money sums (equal to the tour totals — same legs, one sum). Driver net is tour-level, so it is
 *  summed once per distinct settlement, never once per leg row. */
export function tourLoadFooter(state: "open" | "closed") {
  const perTour = (v: TourLoadRow[], pick: (r: TourLoadRow) => number | null) => {
    const seen = new Set<string>(); let n = 0;
    for (const r of v) { if (seen.has(r.settlement_id)) continue; seen.add(r.settlement_id); n += pick(r) ?? 0; }
    return n;
  };
  return {
    tour: (v: TourLoadRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="tour-totals-label">Totals ({new Set(v.map(r => r.settlement_id)).size} tours · {v.filter(r => r.load_id).length} loads)</span>,
    revenue: (v: TourLoadRow[]) => fmt(v.reduce((n, r) => n + r.load_revenue_cents, 0)),
    costs: (v: TourLoadRow[]) => fmt(v.reduce((n, r) => n + r.load_costs_cents, 0)),
    driver_pay: (v: TourLoadRow[]) => fmt(v.reduce((n, r) => n + r.load_driver_pay_cents, 0)),
    tour_margin: (v: TourLoadRow[]) => fmt(v.reduce((n, r) => n + r.load_margin_cents, 0)),
    ...(state === "closed" ? { net: (v: TourLoadRow[]) => fmt(perTour(v, r => r.driver_net_cents)) } : {}),
  };
}
