import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PreSettlementsPanel } from "../PreSettlementsPanel";
import type { SettlementListRow } from "../../../api/driverFinance";

/**
 * DISP-S33: /dispatch/pre-settlements — a failed fetch used to leave `rows` at its `[]` default
 * and render the EXACT SAME "No pre-settlements ready right now." text as a genuine zero-row
 * result: a swallowed error masquerading as an honest empty state. `isError` now takes priority
 * over the zero-row empty text and the total-payout row.
 */
function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PreSettlementsPanel (DISP-S33)", () => {
  it("shows the honest empty state on a genuine zero-row result", () => {
    // Copy evolved to explain WHY it's empty and what to do about it (more honest/actionable
    // than the old "ready right now." string) — anchor on the stable testid instead of prose.
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

  it("renders real rows when the fetch succeeds", () => {
    const rows: SettlementListRow[] = [
      {
        id: "s1",
        driver_id: "d1",
        driver_full_name: "Jordan Ruiz",
        period_start: "2026-08-01",
        period_end: "2026-08-07",
        net_pay: 500,
        load_count: 2,
        status: "presettle",
      } as SettlementListRow,
    ];
    wrap(<PreSettlementsPanel rows={rows} loading={false} isError={false} />);
    expect(screen.getByText("Jordan Ruiz")).toBeTruthy();
  });
});
