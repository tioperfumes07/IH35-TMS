import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BILL_TYPE_TABS, EXPENSE_TYPE_TABS, TypeTabBar } from "../TypeTabBar";

describe("TypeTabBar", () => {
  it("renders flat text tabs with transparent backgrounds", () => {
    render(<TypeTabBar tabs={BILL_TYPE_TABS} activeId="repair" onChange={vi.fn()} />);
    for (const tab of BILL_TYPE_TABS) {
      const btn = screen.getByRole("button", { name: tab.label });
      expect(btn).toBeInTheDocument();
      expect((btn as HTMLButtonElement).style.background).toBe("transparent");
    }
  });

  it("applies active and inactive border/color styles", () => {
    render(<TypeTabBar tabs={BILL_TYPE_TABS} activeId="repair" onChange={vi.fn()} />);
    const active = screen.getByRole("button", { name: "Repair Bill" });
    const inactive = screen.getByRole("button", { name: "Fuel Bill" });
    expect((active as HTMLButtonElement).style.borderBottom).toContain("2px solid");
    expect((active as HTMLButtonElement).style.color).toBe("rgb(31, 42, 68)");
    expect((inactive as HTMLButtonElement).style.borderBottom).toContain("2px solid transparent");
    expect((inactive as HTMLButtonElement).style.color).toBe("rgb(148, 163, 184)");
  });

  it("fires onChange when clicking inactive tab", () => {
    const onChange = vi.fn();
    render(<TypeTabBar tabs={BILL_TYPE_TABS} activeId="repair" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Fuel Bill" }));
    expect(onChange).toHaveBeenCalledWith("fuel");
  });

  it("exports bill tabs in exact order and labels", () => {
    expect(BILL_TYPE_TABS).toEqual([
      { id: "repair", label: "Repair Bill" },
      { id: "fuel", label: "Fuel Bill" },
      { id: "maintenance", label: "Maintenance Bill" },
      { id: "driver", label: "Driver Bill" },
      { id: "vendor", label: "Vendor Bill" },
      { id: "multiple", label: "Multiple Bills" },
    ]);
  });

  it("exports expense tabs in exact order and labels", () => {
    expect(EXPENSE_TYPE_TABS).toEqual([
      { id: "roadside", label: "Roadside Expense" },
      { id: "fuel", label: "Fuel Expense" },
      { id: "tolls", label: "Tolls Expense" },
      { id: "lumper", label: "Lumper Expense" },
      { id: "other", label: "Other Expense" },
    ]);
  });

  // NOTE (D2-1 reversal): CreateBillModal / CreateExpenseModal were un-archived and made
  // functional (Save → createVendorBill / createExpense, mounted in the maintenance UI).
  // Their submit behaviour is covered by dedicated tests under
  // src/pages/maintenance/components/__tests__ rather than render-smoke cases here.
});
