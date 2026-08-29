import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RunnerFilters } from "../RunnerFilters";
import type { RunnerFilter } from "../runner-config";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "00000000-0000-4000-8000-000000000001",
    companies: [],
  }),
}));

const DATE_RANGE_FILTER: RunnerFilter[] = [{ type: "date_range", key: "date_range", label: "Date range", required: true }];

// REPORTS-RUNNER-DATEPICKER-SILENT-DISCARD (GO-0030): live-confirmed bug -- the staged filter
// panel's own "outside click" cancel-and-close listener treated the "Run report" button (a DOM
// sibling, not a descendant of the panel) as an outside click. Picking a new date then clicking
// Run report (skipping the panel's own "Apply" button) fired mousedown -> cancelAndClose() FIRST
// (discarding the just-picked date, reverting the field, closing the panel) and only then fired
// Run's onClick, which ran the report against the OLD, previously-applied date -- silently, with
// no error and no visual indication the pick was lost.
describe("RunnerFilters — date-picker Run report", () => {
  it("runs with the just-picked date instead of silently discarding it (no explicit Apply click)", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    const onChange = vi.fn();

    render(
      <RunnerFilters
        filters={DATE_RANGE_FILTER}
        values={{ from: "2026-01-01", to: "2026-01-31" }}
        onChange={onChange}
        onRun={onRun}
        isRunning={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Filters/i }));

    const fromButton = screen.getByText("01/01/2026");
    await user.click(fromButton);
    // Calendar view opens on the "from" value's month (January 2026); pick day 20.
    await user.click(screen.getByRole("button", { name: "20" }));

    // The field must show the NEW pick, not silently revert -- proves the panel's outside-click
    // cancel no longer fires for the (still-to-be-clicked) Run report button.
    expect(screen.getByText("01/20/2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run report" }));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-01-20", to: "2026-01-31" }));
    // The draft was committed (Apply-equivalent) so the parent's applied state also catches up.
    expect(onChange).toHaveBeenCalledWith("from", "2026-01-20");
  });

  it("still runs with the applied values when nothing was picked (no dirty draft)", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    const onChange = vi.fn();

    render(
      <RunnerFilters
        filters={DATE_RANGE_FILTER}
        values={{ from: "2026-01-01", to: "2026-01-31" }}
        onChange={onChange}
        onRun={onRun}
        isRunning={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Run report" }));

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-01-01", to: "2026-01-31" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
