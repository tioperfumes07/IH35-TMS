import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PreSettlementsPanel } from "../PreSettlementsPanel";
import type { TourListRow } from "../../../api/tourReadout";

/**
 * DISP-S33: /dispatch/pre-settlements — a failed fetch used to leave `rows` at its `[]` default
 * and render the EXACT SAME "No pre-settlements ready right now." text as a genuine zero-row
 * result: a swallowed error masquerading as an honest empty state. `isError` now takes priority
 * over the zero-row empty text and the total-payout row.
 *
 * ROUND 443.280-A — panel rows are TourListRow from listTours (Unit / Ready / Waiting on live).
 */
function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function tour(partial: Partial<TourListRow> & Pick<TourListRow, "settlement_id" | "driver_id" | "driver_name">): TourListRow {
  return {
    display_id: null,
    settlement_number: null,
    status: "open",
    is_open: true,
    unit_id: "u1",
    unit_number: "T100",
    trailer_id: null,
    trailer_number: null,
    trip_started_at: null,
    trip_closed_at: null,
    leg_count: 0,
    legs_label: "",
    legs: [],
    origin_load_number: null,
    origin_pickup_date: null,
    origin_delivery_date: null,
    revenue_cents: 0,
    costs_cents: 0,
    driver_pay_cents: 50_000,
    margin_cents: 0,
    margin_pct: null,
    miles_practical: 0,
    miles_real: null,
    ready_ok: 3,
    ready_total: 6,
    can_close: false,
    close_blockers: ["BOL missing"],
    driver_net_cents: null,
    company_settlement_id: null,
    company_settlement_display_id: null,
    ...partial,
  };
}

describe("PreSettlementsPanel (DISP-S33)", () => {
  it("shows the honest empty state on a genuine zero-row result", () => {
    wrap(<PreSettlementsPanel rows={[]} loading={false} isError={false} />);
    expect(screen.getByTestId("dispatch-pre-settlements-honest-empty")).toBeTruthy();
  });

  it("shows a named error instead of the empty text when the fetch failed", () => {
    wrap(<PreSettlementsPanel rows={[]} loading={false} isError={true} />);
    expect(screen.getByTestId("pre-settlements-error")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-pre-settlements-honest-empty")).toBeNull();
  });

  it("does not show the total-payout row when the fetch failed (no fabricated $0 total)", () => {
    wrap(<PreSettlementsPanel rows={[]} loading={false} isError={true} showTotal />);
    expect(screen.queryByText("Total payout this batch")).toBeNull();
  });

  it("does not invent a zero settlement count or payout while loading", () => {
    wrap(<PreSettlementsPanel rows={[]} loading showTotal />);
    expect(screen.getByText("Open pre-settlements · —")).toBeTruthy();
    expect(screen.queryByText("Total payout this batch")).toBeNull();
    expect(screen.queryByTestId("dispatch-pre-settlements-honest-empty")).toBeNull();
  });

  it("renders real rows when the fetch succeeds", () => {
    const rows = [
      tour({
        settlement_id: "s1",
        driver_id: "d1",
        driver_name: "Jordan Ruiz",
        settlement_number: "5806",
        leg_count: 2,
        legs: [
          {
            load_id: "l1",
            load_number: "13561",
            trip_type: "loaded",
            status: "delivered",
            lane: "A → B",
            pickup_date: null,
            delivery_date: null,
            revenue_cents: 0,
            costs_cents: 0,
            driver_pay_cents: 0,
            margin_cents: 0,
            margin_pct: null,
            miles_practical: null,
            miles_real: null,
            unit_id: null,
            unit_number: null,
            trailer_id: null,
            trailer_number: null,
          },
        ],
      }),
    ];
    wrap(<PreSettlementsPanel rows={rows} loading={false} isError={false} />);
    expect(screen.getByText("Jordan Ruiz")).toBeTruthy();
    expect(screen.getByText("T100")).toBeTruthy();
    expect(screen.getByTestId("pre-settle-ready-dots")).toBeTruthy();
    expect(screen.getByTestId("pre-settle-waiting-on").textContent).toContain("BOL missing");
  });

  // E11-D4 (Lead ruling, 2026-09-23) — "never blank": a load-less row used to render a bare "—"
  // in the Load Number column, indistinguishable from any other missing-data dash on the page.
  it("renders a NAMED gap, not a bare dash, when a settlement has no load link", () => {
    const rows = [
      tour({
        settlement_id: "s3",
        driver_id: "d3",
        driver_name: "No-Load Driver",
        leg_count: 0,
        legs: [],
      }),
    ];
    wrap(<PreSettlementsPanel rows={rows} loading={false} isError={false} />);
    expect(screen.getByText("No load assigned")).toBeTruthy();
  });

  it("renders the board columns and sorts through the shared ParityTable header", () => {
    const rows = [
      tour({
        settlement_id: "s2",
        driver_id: "d2",
        driver_name: "Zulu Driver",
        driver_pay_cents: 70_000,
      }),
      tour({
        settlement_id: "s1",
        driver_id: "d1",
        driver_name: "Alpha Driver",
        driver_pay_cents: 50_000,
      }),
    ];

    wrap(<PreSettlementsPanel rows={rows} loading={false} isError={false} />);
    // 443.280-A board columns only — Period Begin/End / Liabilities / Status dropped.
    for (const header of ["Number", "Driver", "Unit", "Loads so far", "Pay so far", "Ready", "Waiting on"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${header}$`) })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /^Period Begin$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Status$/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Driver$/ }));
    expect(screen.getAllByTestId("pre-settlement-row-reverse")[0]?.textContent).toContain("Alpha Driver");
    expect(screen.getByRole("columnheader", { name: /^Driver/ }).textContent).toContain("▲");
  });
});
