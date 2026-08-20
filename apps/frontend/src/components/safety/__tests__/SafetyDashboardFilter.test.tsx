import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafetyDashboardFilter } from "../SafetyDashboardFilter";

describe("SafetyDashboardFilter", () => {
  it("keeps Activity window / Status collapsed until Filters is opened (CHROME-01)", () => {
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
    expect(screen.getByTestId("safety-filters-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("safety-window-7d")).not.toBeInTheDocument();
    expect(screen.queryByTestId("safety-status-active")).not.toBeInTheDocument();
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

  it("calls onActivityWindowChange when a window pill is clicked inside the Filters panel", () => {
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
    fireEvent.click(screen.getByTestId("safety-filters-toggle"));
    fireEvent.click(screen.getByTestId("safety-window-30d"));
    // Filters are staged (useStagedListFilters, same CollapsedListFilters Apply/Cancel/Reset chrome
    // as every other migrated list-filter panel) — a pill click only updates the draft; the parent
    // callback fires on Apply.
    fireEvent.click(within(screen.getByTestId("safety-filters-panel")).getByRole("button", { name: "Apply" }));
    expect(onWindow).toHaveBeenCalledWith("30d");
  });
});
