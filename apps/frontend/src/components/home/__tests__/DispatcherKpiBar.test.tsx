import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DispatcherKpiBar } from "../DispatcherKpiBar";

// GO-0027-HOME-F: a failed fetch is represented as null, never a fabricated 0 -- matches the C8
// "honest KPI" contract (DrillKpiCard/SafetyKpiBar) used elsewhere; DispatcherHome.tsx used to pass
// `data?.kpis.active_loads ?? 0` unconditionally, rendering "0 Active loads" on a real backend error.
describe("DispatcherKpiBar", () => {
  it("renders real numbers, including a genuine 0", () => {
    render(
      <MemoryRouter>
        <DispatcherKpiBar activeLoads={3} lateLoads={0} todayPickups={5} todayDeliveries={2} />
      </MemoryRouter>
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // a genuine 0 (late loads) must still render as "0", not "—"
    const lateLoadsCard = screen.getByLabelText(/late loads/i);
    expect(lateLoadsCard).toHaveTextContent("0");
  });

  it("renders — (never 0) for null values", () => {
    render(
      <MemoryRouter>
        <DispatcherKpiBar activeLoads={null} lateLoads={null} todayPickups={null} todayDeliveries={null} />
      </MemoryRouter>
    );
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(4);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
