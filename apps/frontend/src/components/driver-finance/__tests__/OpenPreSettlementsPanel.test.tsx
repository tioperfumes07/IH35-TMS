import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { OpenPreSettlementsPanel } from "../OpenPreSettlementsPanel";
import type { OpenPreSettlement } from "../../../api/driverFinance";

// E11-D4 (Lead ruling, 2026-09-23): "pre-settlement is a first-class board state, its own
// column; 6 of 9 have no load assigned = a NAMED GAP never blank." This is the regression lock
// for the two claims that ruling makes: the open (still accumulating) cohort actually renders at
// all, and a settlement with no load bookended to it yet says so by name.
function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function row(overrides: Partial<OpenPreSettlement> = {}): OpenPreSettlement {
  return {
    settlement_id: "ps-1",
    settlement_number: "S-2026-5815",
    driver_id: "drv-1",
    driver_name: "Leonel Antonio Morales",
    first_load_id: null,
    first_load_number: null,
    last_load_id: null,
    last_load_number: null,
    status: "open",
    gross_pay: 0,
    deductions_total: -45,
    net_pay: -45,
    trip_started_at: "2026-09-16",
    ...overrides,
  };
}

describe("OpenPreSettlementsPanel — E11-D4", () => {
  it("shows the honest empty state on a genuine zero-row result", () => {
    wrap(<OpenPreSettlementsPanel rows={[]} loading={false} isError={false} />);
    expect(screen.getByTestId("dispatch-open-pre-settlements-honest-empty")).toBeTruthy();
  });

  it("shows a named error instead of the empty text when the fetch failed", () => {
    wrap(<OpenPreSettlementsPanel rows={[]} loading={false} isError={true} />);
    expect(screen.getByTestId("open-pre-settlements-error")).toBeTruthy();
    expect(screen.queryByTestId("dispatch-open-pre-settlements-honest-empty")).toBeNull();
  });

  it("renders a driver with no load assigned as a NAMED gap, never a blank cell", () => {
    wrap(<OpenPreSettlementsPanel rows={[row()]} loading={false} isError={false} />);
    expect(screen.getByText("Leonel Antonio Morales")).toBeTruthy();
    expect(screen.getByTestId("open-pre-settlement-no-load")).toBeTruthy();
    expect(screen.getByText("No load assigned yet")).toBeTruthy();
  });

  it("renders a real load link (not the named gap) once one is bookended", () => {
    wrap(
      <OpenPreSettlementsPanel
        rows={[row({ first_load_id: "load-13610", first_load_number: "13610", last_load_id: "load-13610", last_load_number: "13610" })]}
        loading={false}
        isError={false}
      />
    );
    expect(screen.queryByTestId("open-pre-settlement-no-load")).toBeNull();
    expect(screen.getByText("13610")).toBeTruthy();
  });

  it("title names how many of the shown tours have no load assigned (matches the ruling's own '6 of 9' framing)", () => {
    wrap(
      <OpenPreSettlementsPanel
        rows={[row({ settlement_id: "ps-1" }), row({ settlement_id: "ps-2", first_load_id: "l1", first_load_number: "13610" })]}
        loading={false}
        isError={false}
      />
    );
    expect(screen.getByText(/2 tour\(s\)/)).toBeTruthy();
    expect(screen.getByText(/1 with no load assigned yet/)).toBeTruthy();
  });

  it("does not invent a zero tour count while loading", () => {
    wrap(<OpenPreSettlementsPanel rows={[]} loading={true} isError={false} />);
    expect(screen.getByText(/Open — accumulating · —/)).toBeTruthy();
  });
});
