import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GearState, ListViewColumn } from "../types";
import { ListViewGear } from "./ListViewGear";

type Row = { id: string; name: string };

const columns: Array<ListViewColumn<Row>> = [
  { id: "name", label: "Name" },
];

const gear: GearState = {
  visibleColumns: { name: true },
  includeInactive: true,
  statusFilter: "all",
  showBadges: true,
  pageSize: 50,
  density: "cozy",
};

describe("ListViewGear Apply law", () => {
  it("does not publish draft settings until Apply", () => {
    const onGearChange = vi.fn();
    render(<ListViewGear columns={columns} gear={gear} onGearChange={onGearChange} />);
    fireEvent.click(screen.getByLabelText("List settings"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Name" }));
    expect(onGearChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onGearChange).toHaveBeenCalledWith(expect.objectContaining({ visibleColumns: { name: false } }));
  });
});
