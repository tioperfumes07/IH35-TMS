import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafetyDashboardFilter } from "../SafetyDashboardFilter";

describe("SafetyDashboardFilter", () => {
  it("defaults activity window to 7d label in summary", () => {
    render(
      <SafetyDashboardFilter
        value="active"
        onChange={vi.fn()}
        activityWindow="7d"
        onActivityWindowChange={vi.fn()}
        shown={3}
        total={10}
      />
    );
    expect(screen.getByText(/window 7d/i)).toBeInTheDocument();
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
