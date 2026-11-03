import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectedExpenseCell } from "./ActualVsProjectedTab";
import type { AvpLineItem } from "../../../api/cashFlow";

// E8 11-03 (row 261): a past day before expense capture is "not captured", never a projected $0.
const base: AvpLineItem = { date: "2026-10-05", category: "expenses", projected_cents: 0, actual_cents: 9999, variance_cents: 0, variance_pct: null };

describe("ProjectedExpenseCell", () => {
  it("not_captured renders 'not captured', never $0", () => {
    render(<ProjectedExpenseCell line={{ ...base, projected_basis: "not_captured", projected_unavailable: true }} />);
    expect(screen.getByTestId("cash-flow-avp-proj-exp-not-captured").textContent).toBe("not captured");
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("snapshot renders the amount plus its capture provenance", () => {
    render(
      <ProjectedExpenseCell
        line={{ ...base, projected_cents: 70_200, projected_basis: "snapshot", projected_captured_at: "2026-11-04T12:10:00Z" }}
      />
    );
    expect(screen.getByText(/702\.00/)).toBeTruthy();
    expect(screen.getByText(/^snapshot /)).toBeTruthy();
  });

  it("engine (today/later) renders the amount with no snapshot label; older servers (no basis) still render the amount", () => {
    const { unmount } = render(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000, projected_basis: "engine" }} />);
    expect(screen.getByText(/50\.00/)).toBeTruthy();
    expect(screen.queryByText(/^snapshot /)).toBeNull();
    unmount();
    render(<ProjectedExpenseCell line={{ ...base, projected_cents: 5_000 }} />);
    expect(screen.getByText(/50\.00/)).toBeTruthy();
  });
});
