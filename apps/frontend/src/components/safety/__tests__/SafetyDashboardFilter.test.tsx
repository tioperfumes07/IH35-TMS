import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafetyDashboardFilter } from "../SafetyDashboardFilter";

describe("SafetyDashboardFilter", () => {
  it("shows the counter summary with the window label when counts are reported", () => {
    render(
      <SafetyDashboardFilter
        value="active"
        onChange={vi.fn()}
        activityWindow="7d"
        onActivityWindowChange={vi.fn()}
        shown={3}
        total={10}
        countsReported
      />
    );
    expect(screen.getByText(/window 7d/i)).toBeInTheDocument();
  });

  it("hides the counter line when no tab has reported counts (no lying 0·0·0)", () => {
    render(
      <SafetyDashboardFilter
        value="active"
        onChange={vi.fn()}
        activityWindow="7d"
        onActivityWindowChange={vi.fn()}
        shown={0}
        total={0}
      />
    );
    expect(screen.queryByTestId("safety-counter-line")).not.toBeInTheDocument();
  });

  it("calls onActivityWindowChange when a window pill is clicked", () => {
    const onWindow = vi.fn();
    render(
      <SafetyDashboardFilter
        value="active"
        onChange={vi.fn()}
        activityWindow="7d"
        onActivityWindowChange={onWindow}
        shown={1}
        total={5}
      />
    );
    fireEvent.click(screen.getByTestId("safety-window-30d"));
    expect(onWindow).toHaveBeenCalledWith("30d");
  });
});
