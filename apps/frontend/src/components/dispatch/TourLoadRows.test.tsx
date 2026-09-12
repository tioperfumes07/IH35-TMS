// DISPATCH-ONE-ROW-PER-LOAD + DISPATCH-NO-HISTORY (owner 2026-09-11): the Load-Costs Pre-Settlement /
// Settlement registers render ONE ROW PER LOAD off the /tours read model, per-load money on each row,
// tour-level money summed once per tour, and the settlement number is the AlwaysTrack doc or "Open".
import { describe, expect, it } from "vitest";
import type { TourListRow } from "../../api/tourReadout";
import { flattenTourRows, TOUR_LOAD_COLUMNS, tourLoadFooter } from "./TourLoadRows";

const leg = (load_id: string, load_number: string, trip_type: string, revenue: number, costs: number, pay: number) => ({
  load_id, load_number, trip_type, status: "dispatched", lane: "Laredo TX → Dallas TX", pickup_date: "2026-09-10", delivery_date: "2026-09-11",
  revenue_cents: revenue, costs_cents: costs, driver_pay_cents: pay, margin_cents: revenue - costs - pay, margin_pct: revenue ? ((revenue - costs - pay) / revenue) * 100 : null,
  miles_practical: 450, miles_real: null,
});

const tour = (settlement_id: string, legs: ReturnType<typeof leg>[], extra: Partial<TourListRow> = {}): TourListRow => ({
  settlement_id, display_id: "S-2026-0013", status: "open", is_open: true, driver_name: "Luis", unit_number: "604",
  trip_started_at: "2026-09-10", trip_closed_at: null, leg_count: legs.length, legs_label: legs.map(l => `${l.trip_type} ${l.load_number}`).join(" → "),
  legs, origin_load_number: legs[0]?.load_number ?? null, origin_pickup_date: null, origin_delivery_date: null,
  revenue_cents: legs.reduce((n, l) => n + l.revenue_cents, 0), costs_cents: legs.reduce((n, l) => n + l.costs_cents, 0),
  driver_pay_cents: legs.reduce((n, l) => n + l.driver_pay_cents, 0), margin_cents: legs.reduce((n, l) => n + l.margin_cents, 0), margin_pct: null,
  miles_practical: 900, miles_real: null, ready_ok: 3, ready_total: 5, can_close: false, close_blockers: ["POD missing"], driver_net_cents: 123400, company_settlement_display_id: null,
  ...extra,
} as TourListRow);

describe("TourLoadRows — one row per load", () => {
  it("flattens a 2-leg tour into 2 rows carrying that load's own money, and keeps the tour cells on both", () => {
    const rows = flattenTourRows([tour("s1", [leg("l1", "13588", "NB", 350000, 50000, 90000), leg("l2", "13593", "SB", 280000, 20000, 70000)])]);
    expect(rows.map(r => r.load_number)).toEqual(["13588", "13593"]);
    expect(rows.map(r => r.row_key)).toEqual(["s1:l1", "s1:l2"]);
    expect(rows[0].load_revenue_cents).toBe(350000);
    expect(rows[1].load_revenue_cents).toBe(280000);
    expect(rows[0].leg_index).toBe(1); expect(rows[1].leg_index).toBe(2);
    expect(rows.every(r => r.driver_name === "Luis" && r.settlement_id === "s1")).toBe(true);
  });

  it("footer sums per-load money (equal to the tour totals) and driver net ONCE per tour, not once per leg", () => {
    const rows = flattenTourRows([
      tour("s1", [leg("l1", "13588", "NB", 350000, 50000, 90000), leg("l2", "13593", "SB", 280000, 20000, 70000)], { driver_net_cents: 100000 }),
      tour("s2", [leg("l3", "13590", "NB", 100000, 0, 30000)], { driver_net_cents: 50000 }),
    ]);
    const f = tourLoadFooter("closed") as Record<string, (v: typeof rows) => unknown>;
    expect(f.revenue(rows)).toBe("$7,300.00");
    expect(f.driver_pay(rows)).toBe("$1,900.00");
    expect(f.net(rows)).toBe("$1,500.00");
  });

  it("a closed tour with no live leg still surfaces as one dashed row (never silently hidden)", () => {
    const rows = flattenTourRows([tour("s9", [], { is_open: false, trip_closed_at: "2026-09-01" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].load_id).toBe("");
    expect(rows[0].load_number).toBe("—");
  });

  it("Settlement/Tour column sorts on the AlwaysTrack number or 'Open' — never the S-YYYY-NNNN counter", () => {
    const cols = TOUR_LOAD_COLUMNS("open");
    const open = flattenTourRows([tour("s1", [leg("l1", "13588", "NB", 1, 0, 0)])])[0];
    expect(cols[0].key).toBe("tour");
    expect(cols[1].key).toBe("load_number");
    expect(String(cols[0].sortValue?.(open))).toBe("Open");
    expect(String(cols[0].sortValue?.(open))).not.toContain("S-2026");
  });
});
