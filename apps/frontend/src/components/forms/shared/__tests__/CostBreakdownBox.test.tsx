import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CostBreakdownBox, type CategoryLine, type ItemLine } from "../CostBreakdownBox";

function makeCategory(overrides: Partial<CategoryLine> = {}): CategoryLine {
  return {
    id: crypto.randomUUID(),
    expense_category_uuid: "cat-1",
    description: "Category",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ItemLine> = {}): ItemLine {
  return {
    id: crypto.randomUUID(),
    service_item_uuid: "svc-1",
    description: "Item",
    location_label: "",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
    sub_rows: [],
    ...overrides,
  };
}

describe("CostBreakdownBox", () => {
  it("always renders section A and section B controls", () => {
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );

    expect(screen.getByText("Section A - Category lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create category line" })).toBeInTheDocument();
    expect(screen.getByText("Section B - Item lines (service items / parts / labor)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create item line" })).toBeInTheDocument();
  });

  it("adds one category line when create category is clicked", () => {
    const category = makeCategory();
    const onSectionAChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [category] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={onSectionAChange}
        onSectionBChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Create category line" }));
    const next = onSectionAChange.mock.lastCall?.[0] as CategoryLine[];
    expect(next).toHaveLength(2);
  });

  it("adds one item line when create item is clicked", () => {
    const item = makeItem();
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [item] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Create item line" }));
    const next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next).toHaveLength(2);
  });

  it("removes section A line when x is clicked", () => {
    const onSectionAChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [makeCategory(), makeCategory()] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={onSectionAChange}
        onSectionBChange={vi.fn()}
      />
    );

    const sectionATable = screen.getByText("Section A - Category lines").closest("div")?.nextElementSibling;
    const firstRemoveButton = within(sectionATable as HTMLElement).getAllByRole("button", { name: "x" })[0];
    fireEvent.click(firstRemoveButton);
    const next = onSectionAChange.mock.lastCall?.[0] as CategoryLine[];
    expect(next).toHaveLength(1);
  });

  it("removes section B line when x is clicked", () => {
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [makeItem(), makeItem()] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    const productServiceInput = screen.getAllByPlaceholderText("Product/Service")[0];
    const lineCard = productServiceInput.closest("div.rounded.border.border-gray-200.bg-white.p-2");
    const removeButton = within(lineCard as HTMLElement).getByRole("button", { name: "x" });
    fireEvent.click(removeButton);
    const next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next).toHaveLength(1);
  });

  it("renders subtotal A from amounts at $0, $24.50, and $1500", () => {
    const { rerender } = render(
      <CostBreakdownBox
        sectionA={{ lines: [makeCategory({ amount: 0 })] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.getByText("Subtotal A: $0.00")).toBeInTheDocument();

    rerender(
      <CostBreakdownBox
        sectionA={{ lines: [makeCategory({ amount: 24.5 })] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.getByText("Subtotal A: $24.50")).toBeInTheDocument();

    rerender(
      <CostBreakdownBox
        sectionA={{ lines: [makeCategory({ amount: 1000 }), makeCategory({ amount: 500 })] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.getByText("Subtotal A: $1500.00")).toBeInTheDocument();
  });

  it("computes subtotal B from max(line amount, parts/labor subrows sum)", () => {
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{
          lines: [
            makeItem({
              amount: 15,
              sub_rows: [
                { id: "p1", line_type: "parts", description: "Part A", quantity: 1, unit_cost: 20, amount: 20, part_location_codes: ["STEER-L"] },
                { id: "l1", line_type: "labor", description: "Labor A", quantity: 1, unit_cost: 30, amount: 30 },
              ],
            }),
            makeItem({ amount: 40, sub_rows: [] }),
          ],
        }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );

    expect(screen.getByText("Subtotal B: $90.00")).toBeInTheDocument();
  });

  it("honors partsLaborMode variants", () => {
    const item = makeItem({ sub_rows: [] });
    const { rerender } = render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [item] }}
        partsLaborMode="none"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.queryByText("Parts & Labor")).not.toBeInTheDocument();

    rerender(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [item] }}
        partsLaborMode="parts-only"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "+ Create part" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Create labor" })).not.toBeInTheDocument();

    rerender(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [item] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "+ Create part" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create labor" })).toBeInTheDocument();
  });

  it("opens location map callback with lineId and rowId", () => {
    const line = makeItem({
      sub_rows: [{ id: "row-1", line_type: "parts", description: "Part", quantity: 1, unit_cost: 0, amount: 0, part_location_codes: [] }],
    });
    const onOpenLocationMap = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [line] }}
        partsLaborMode="parts-only"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
        onOpenLocationMap={onOpenLocationMap}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select location(s)" }));
    expect(onOpenLocationMap).toHaveBeenCalledWith(line.id, "row-1");
  });

  it("blocks edits when readOnly is true", async () => {
    const onSectionAChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [makeCategory()] }}
        sectionB={{ lines: [] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={onSectionAChange}
        onSectionBChange={vi.fn()}
        readOnly
      />
    );

    const input = screen.getByPlaceholderText("expense_category_uuid");
    expect(input).toBeDisabled();
    await userEvent.type(input, "new-value");
    expect(onSectionAChange).not.toHaveBeenCalled();
  });

  it("renders six section B data columns and no MPG/ODO fields", () => {
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [makeItem()] }}
        partsLaborMode="none"
        onSectionAChange={vi.fn()}
        onSectionBChange={vi.fn()}
      />
    );

    const rowGrid = screen.getByPlaceholderText("Product/Service").closest("div.grid");
    expect(rowGrid?.children.length).toBe(7);
    expect(screen.getByPlaceholderText("Product/Service")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Description")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Location")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Qty")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cost")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("MPG")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("ODO Fill At")).not.toBeInTheDocument();
    expect(screen.queryByText("MPG")).not.toBeInTheDocument();
  });

  it("updates section A text, quantity, and cost fields", () => {
    const line = makeCategory({ quantity: 1, unit_cost: 10, amount: 10 });
    const onSectionAChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [line] }}
        sectionB={{ lines: [] }}
        partsLaborMode="none"
        onSectionAChange={onSectionAChange}
        onSectionBChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByDisplayValue("cat-1"), { target: { value: "cat-2" } });
    expect((onSectionAChange.mock.lastCall?.[0] as CategoryLine[])[0].expense_category_uuid).toBe("cat-2");

    fireEvent.change(screen.getByDisplayValue("Category"), { target: { value: "Updated desc" } });
    expect((onSectionAChange.mock.lastCall?.[0] as CategoryLine[])[0].description).toBe("Updated desc");

    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "3" } });
    expect((onSectionAChange.mock.lastCall?.[0] as CategoryLine[])[0].amount).toBe(30);

    fireEvent.change(screen.getByDisplayValue("10"), { target: { value: "5" } });
    expect((onSectionAChange.mock.lastCall?.[0] as CategoryLine[])[0].amount).toBe(5);
  });

  it("updates section B line fields and recomputes amount", () => {
    const line = makeItem({ quantity: 2, unit_cost: 10, amount: 20 });
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [line] }}
        partsLaborMode="none"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue("svc-1"), { target: { value: "svc-2" } });
    expect((onSectionBChange.mock.lastCall?.[0] as ItemLine[])[0].service_item_uuid).toBe("svc-2");

    fireEvent.change(screen.getByDisplayValue("Item"), { target: { value: "Engine Service" } });
    expect((onSectionBChange.mock.lastCall?.[0] as ItemLine[])[0].description).toBe("Engine Service");

    fireEvent.change(screen.getByPlaceholderText("Location"), { target: { value: "STEER-L" } });
    expect((onSectionBChange.mock.lastCall?.[0] as ItemLine[])[0].location_label).toBe("STEER-L");

    fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "4" } });
    expect((onSectionBChange.mock.lastCall?.[0] as ItemLine[])[0].amount).toBe(40);

    fireEvent.change(screen.getByDisplayValue("10"), { target: { value: "8" } });
    expect((onSectionBChange.mock.lastCall?.[0] as ItemLine[])[0].amount).toBe(16);
  });

  it("supports adding and editing parts and labor sub-rows", () => {
    const line = makeItem({ sub_rows: [] });
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [line] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Create part" }));
    let next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows).toHaveLength(1);
    expect(next[0].sub_rows?.[0].line_type).toBe("parts");

    fireEvent.click(screen.getByRole("button", { name: "+ Create labor" }));
    next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows).toHaveLength(1);
    expect(next[0].sub_rows?.[0].line_type).toBe("labor");
  });

  it("updates part/labor sub-row text and numeric fields", () => {
    const line = makeItem({
      sub_rows: [
        { id: "part-row", line_type: "parts", description: "Old part", quantity: 1, unit_cost: 5, amount: 5, part_location_codes: [] },
        { id: "labor-row", line_type: "labor", description: "Old labor", quantity: 1, unit_cost: 10, amount: 10 },
      ],
    });
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [line] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Old part"), { target: { value: "Part changed" } });
    let next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows?.[0].description).toBe("Part changed");

    fireEvent.change(screen.getByDisplayValue("Old labor"), { target: { value: "Labor changed" } });
    next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows?.[1].description).toBe("Labor changed");

    const partDescInput = screen.getByDisplayValue("Old part");
    const partRow = partDescInput.closest("div.mb-1.grid");
    const numericInputs = within(partRow as HTMLElement).getAllByRole("spinbutton");
    fireEvent.change(numericInputs[0], { target: { value: "3" } });
    next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows?.[0].amount).toBe(15);

    // M-1: the sub-row cost is now a dollars-mode MoneyInput (display-only QBO format; the value stays a
    // DOLLAR number, so cost 7 → amount 7 — byte-for-byte, no cents conversion).
    const partCostInput = within(partRow as HTMLElement).getByLabelText("Sub-row cost");
    fireEvent.change(partCostInput, { target: { value: "7" } });
    next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows?.[0].amount).toBe(7);
  });

  it("renders no-location box for labor rows and can remove sub-row", () => {
    const line = makeItem({
      sub_rows: [{ id: "labor-row", line_type: "labor", description: "Labor", quantity: 1, unit_cost: 10, amount: 10 }],
    });
    const onSectionBChange = vi.fn();
    render(
      <CostBreakdownBox
        sectionA={{ lines: [] }}
        sectionB={{ lines: [line] }}
        partsLaborMode="parts-and-labor"
        onSectionAChange={vi.fn()}
        onSectionBChange={onSectionBChange}
      />
    );

    expect(screen.getByText("No location")).toBeInTheDocument();
    const subRemoveButton = screen.getAllByRole("button", { name: "x" }).at(-1) as HTMLButtonElement;
    fireEvent.click(subRemoveButton);
    const next = onSectionBChange.mock.lastCall?.[0] as ItemLine[];
    expect(next[0].sub_rows).toHaveLength(0);
  });
});
