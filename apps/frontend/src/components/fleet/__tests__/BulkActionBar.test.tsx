import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkActionBar, FLEET_BULK_STATUS_OPTIONS } from "../BulkActionBar";

describe("BulkActionBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(
      <BulkActionBar selectedCount={0} vehicleTypes={["Sleeper"]} onApply={vi.fn()} onClear={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Change Status combobox with 5 options", () => {
    render(
      <BulkActionBar selectedCount={2} vehicleTypes={["Sleeper", "Day Cab"]} onApply={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText("Selected: 2 units")).toBeTruthy();
    const statusPicker = screen.getByLabelText("Change Status");
    fireEvent.focus(statusPicker);
    for (const status of FLEET_BULK_STATUS_OPTIONS) {
      expect(screen.getByRole("option", { name: status })).toBeTruthy();
    }
  });

  it("calls onApply with status patch when Apply is clicked", () => {
    const onApply = vi.fn();
    render(
      <BulkActionBar selectedCount={1} vehicleTypes={["Sleeper"]} onApply={onApply} onClear={vi.fn()} />
    );
    fireEvent.focus(screen.getByLabelText("Change Status"));
    fireEvent.click(screen.getByRole("option", { name: "OOS" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ status: "OOS" });
  });
});
