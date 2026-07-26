import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DrillKpiCard, formatKpiValue, KPI_NO_VALUE } from "./DrillKpiCard";

/**
 * C8 — the two rules the shared card exists to enforce:
 *   1. every card drills somewhere (the type makes a target mandatory; these assert the DOM),
 *   2. a number is live-backed or it renders "—" (never a fabricated 0).
 * Guard: scripts/verify-no-dead-kpi-cards.mjs (verify-step 1558).
 */
describe("formatKpiValue — honest UI", () => {
  it("renders an em-dash for absent data, and 0 only for a real zero", () => {
    expect(formatKpiValue(null)).toBe(KPI_NO_VALUE);
    expect(formatKpiValue(undefined)).toBe(KPI_NO_VALUE);
    expect(formatKpiValue("")).toBe(KPI_NO_VALUE);
    expect(formatKpiValue(Number.NaN)).toBe(KPI_NO_VALUE);
    expect(formatKpiValue(Number.POSITIVE_INFINITY)).toBe(KPI_NO_VALUE);
    // A genuine zero is still a reading and must survive.
    expect(formatKpiValue(0)).toBe("0");
    expect(formatKpiValue(7)).toBe("7");
    expect(formatKpiValue("$1,204")).toBe("$1,204");
  });
});

describe("DrillKpiCard — click-through", () => {
  it("renders a link for `to`", () => {
    render(
      <MemoryRouter>
        <DrillKpiCard label="Open WOs" value={7} to="/maintenance/active-wos" />
      </MemoryRouter>
    );
    const link = screen.getByLabelText("Open WOs — view records");
    expect(link).toHaveAttribute("href", "/maintenance/active-wos");
    expect(link).toHaveAttribute("data-kpi-drill", "to");
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders a button for `onClick` and fires it", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DrillKpiCard label="Late loads" value={3} onClick={onClick} />
      </MemoryRouter>
    );
    await user.click(screen.getByLabelText("Late loads — view records"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the honest non-navigable state with its stated reason", () => {
    render(
      <MemoryRouter>
        <DrillKpiCard label="Total Revenue" value={null} unavailable="Profitability feed is not connected." />
      </MemoryRouter>
    );
    const tile = screen.getByLabelText("Total Revenue — Profitability feed is not connected.");
    expect(tile).toHaveAttribute("data-kpi-unavailable", "true");
    expect(tile).toHaveAttribute("title", "Profitability feed is not connected.");
    expect(tile).not.toHaveAttribute("href");
    expect(screen.getByText(KPI_NO_VALUE)).toBeInTheDocument();
  });

  it("shows an em-dash rather than a zero when the metric is absent", () => {
    render(
      <MemoryRouter>
        <DrillKpiCard label="Severe / OOS" value={null} to="/maintenance/severe-repairs" />
      </MemoryRouter>
    );
    expect(screen.getByText(KPI_NO_VALUE)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
