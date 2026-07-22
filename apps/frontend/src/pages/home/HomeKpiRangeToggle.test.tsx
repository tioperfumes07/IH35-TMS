import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeKpiRangeToggle, revenueKpiLabel } from "./HomeKpiRangeToggle";

describe("HomeKpiRangeToggle (h-05)", () => {
  it("renders all five range presets and marks the active one", () => {
    render(<HomeKpiRangeToggle value="30d" onChange={() => {}} />);
    for (const id of ["today", "7d", "30d", "mtd", "ytd"]) {
      expect(screen.getByTestId(`home-kpi-range-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("home-kpi-range-30d")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("home-kpi-range-today")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChange with the clicked preset", () => {
    const onChange = vi.fn();
    render(<HomeKpiRangeToggle value="today" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("home-kpi-range-ytd"));
    expect(onChange).toHaveBeenCalledWith("ytd");
  });

  it("revenue KPI label reflects the range (Today keeps legacy label)", () => {
    expect(revenueKpiLabel("today")).toBe("Today's Revenue");
    expect(revenueKpiLabel("7d")).toBe("Revenue (7d)");
    expect(revenueKpiLabel("mtd")).toBe("Revenue (MTD)");
    expect(revenueKpiLabel("ytd")).toBe("Revenue (YTD)");
  });
});
