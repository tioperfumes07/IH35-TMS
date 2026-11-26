import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PerfumePhoneCards, cellText } from "./PerfumePhoneCards";
import type { PerfumeGridCol } from "../../api/perfume";

const cols: PerfumeGridCol[] = [
  { key: "brand", label: "Brand", group: "Item", kind: "text" },
  { key: "name", label: "Name", group: "Item", kind: "text" },
  { key: "my_offer_price", label: "My price", group: "Mine", kind: "money" },
  { key: "low_buy_price", label: "Lowest supplier", group: "Suppliers", kind: "money" },
  { key: "low_buy_vendor", label: "Lowest supplier vendor", group: "Suppliers", kind: "text" },
  { key: "v:abc:price", label: "PCA price", group: "Suppliers", kind: "money" },
  { key: "s:def:price", label: "MTZ price", group: "Competitors", kind: "money" },
];

describe("PerfumePhoneCards", () => {
  it("formats cents, percents and counts the same way the grid does", () => {
    expect(cellText({ kind: "money" }, 1234)).toBe("$12.34");
    expect(cellText({ kind: "money" }, -50)).toBe("−$0.50");
    expect(cellText({ kind: "pct" }, 12.345)).toBe("12.3%");
    expect(cellText({ kind: "int" }, 1200)).toBe("1,200");
    expect(cellText({ kind: "money" }, null)).toBe("—");
  });

  it("shows one card per item with the headline prices and opens every other price on tap", () => {
    render(
      <PerfumePhoneCards
        loading={false}
        emptyText="none"
        cols={cols}
        rows={[{ id: "1", brand: "Lattafa", name: "Asad", size_ml: 100, my_offer_price: 1650, low_buy_price: 1425, low_buy_vendor: "PCA", "v:abc:price": 1425, "s:def:price": 1700 }]}
      />,
    );
    expect(screen.getAllByTestId("perfume-phone-card")).toHaveLength(1);
    expect(screen.getByText("Lattafa · Asad")).toBeTruthy();
    expect(screen.getByText("100 ml")).toBeTruthy();
    expect(screen.getByText("$16.50")).toBeTruthy();
    expect(screen.queryByTestId("perfume-phone-card-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("perfume-phone-card-toggle"));
    const detail = screen.getByTestId("perfume-phone-card-detail");
    expect(detail.textContent).toContain("PCA price");
    expect(detail.textContent).toContain("$14.25");
    expect(detail.textContent).toContain("MTZ price");
    expect(detail.textContent).toContain("$17.00");
  });

  it("says why the list is empty", () => {
    render(<PerfumePhoneCards loading={false} emptyText="No items match the search and filters." cols={cols} rows={[]} />);
    expect(screen.getByTestId("perfume-phone-empty").textContent).toBe("No items match the search and filters.");
  });
});
