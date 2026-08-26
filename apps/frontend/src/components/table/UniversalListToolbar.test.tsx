import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  UniversalListToolbar,
  applyUniversalListFilters,
  inferUniversalRangeColumns,
} from "./UniversalListToolbar";

const rows = [
  { id: "1", name: "Alpha Freight", created_at: "2026-08-01T12:00:00Z", total_cents: 12500 },
  { id: "2", name: "Bravo Logistics", created_at: "2026-08-10T12:00:00Z", total_cents: 35000 },
];

describe("UniversalListToolbar", () => {
  it("infers Legal SOL / hearing and *_at columns as date range fields", () => {
    const cols = inferUniversalRangeColumns([
      { key: "statute_of_limitations_at", label: "SOL / hearing" },
      { key: "next_hearing_date", label: "Next hearing" },
      { key: "status", label: "Status" },
    ]);
    expect(cols.map((c) => c.key)).toEqual(["statute_of_limitations_at", "next_hearing_date"]);
    expect(cols.every((c) => c.kind === "date")).toBe(true);
  });

  it("filters every row value plus ISO dates and cents-backed money ranges", () => {
    expect(applyUniversalListFilters(rows, "bravo", null)).toEqual([rows[1]]);
    expect(applyUniversalListFilters(rows, "", { key: "created_at", kind: "date", from: "2026-08-05", to: "" })).toEqual([rows[1]]);
    expect(applyUniversalListFilters(rows, "", { key: "total_cents", kind: "amount", from: "100", to: "200" })).toEqual([rows[0]]);
  });

  it("does not claim no range columns when SOL/hearing is available but unselected", async () => {
    const user = userEvent.setup();
    render(
      <UniversalListToolbar
        search=""
        onSearchChange={vi.fn()}
        columns={[
          { key: "statute_of_limitations_at", label: "SOL / hearing" },
          { key: "status", label: "Status" },
        ]}
        range={null}
        onRangeApply={vi.fn()}
        resultCount={5}
        totalCount={5}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Date or amount range" }));
    expect(screen.getByText("Choose a field above to set From/To.")).toBeInTheDocument();
    expect(screen.queryByText("This list has no date or amount column to range-filter.")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SOL / hearing" })).toBeInTheDocument();
  });

  it("keeps search at a fixed QBO width instead of stretching", () => {
    const { container } = render(
      <UniversalListToolbar
        search=""
        onSearchChange={vi.fn()}
        columns={[{ key: "status", label: "Status" }]}
        range={null}
        onRangeApply={vi.fn()}
        resultCount={2}
        totalCount={2}
      />,
    );
    expect(container.querySelector('[class*="w-[14rem]"]')).toBeTruthy();
  });

    it("claims no range columns only when inference finds zero fields", async () => {
    const user = userEvent.setup();
    render(
      <UniversalListToolbar
        search=""
        onSearchChange={vi.fn()}
        columns={[{ key: "status", label: "Status" }, { key: "type", label: "Type" }]}
        range={null}
        onRangeApply={vi.fn()}
        resultCount={2}
        totalCount={2}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Date or amount range" }));
    expect(screen.getByText("This list has no date or amount column to range-filter.")).toBeInTheDocument();
  });
});
