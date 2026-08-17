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

  it("keeps range edits draft-only until Apply and cancels them on Escape", async () => {
    const user = userEvent.setup();
    const onRangeApply = vi.fn();
    render(
      <UniversalListToolbar
        search=""
        onSearchChange={vi.fn()}
        columns={[{ key: "created_at", label: "Created date" }, { key: "total_cents", label: "Total" }]}
        range={null}
        onRangeApply={onRangeApply}
        resultCount={2}
        totalCount={2}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Date or amount range" }));
    await user.selectOptions(screen.getByLabelText("Range field"), "total_cents");
    expect(onRangeApply).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onRangeApply).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Range field")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Date or amount range" }));
    await user.selectOptions(screen.getByLabelText("Range field"), "total_cents");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onRangeApply).toHaveBeenCalledWith({ key: "total_cents", kind: "amount", from: "", to: "" });
  });
});
