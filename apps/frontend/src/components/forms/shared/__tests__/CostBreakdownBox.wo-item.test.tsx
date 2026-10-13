import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CostBreakdownBox, type CategoryLine } from "../CostBreakdownBox";

// ACCT-F4431382 — a WO Section A CATEGORY line names its item (DEGH-03 rule, same as a check category line): only the
// items whose default expense account IS the line's category account are offered; exactly one = picked for the
// operator (the deterministic mapping); none / several = the operator must pick (inline message). Never a guess.
// FAILS on origin/main: the WO Section A row had no Item column, so no item ever reached the line.

let itemsForAccount: Record<string, Array<{ id: string; name: string }>> = {};
const itemQueryCalls: Array<{ expenseAccountId?: string | null; kind?: string }> = [];
vi.mock("../../../../hooks/useAccountingItemsQuery", () => ({
  useAccountingItemsQuery: (p: { expenseAccountId?: string | null; kind?: string; enabled?: boolean }) => {
    itemQueryCalls.push({ expenseAccountId: p.expenseAccountId, kind: p.kind });
    const rows = p.enabled === false || !p.expenseAccountId ? undefined : (itemsForAccount[p.expenseAccountId] ?? []);
    return {
      data: rows?.map((r) => ({ ...r, qbo_id: null, item_type: "service", unit_price_cents: null })),
      isLoading: false,
      isSuccess: rows !== undefined,
    };
  },
}));
vi.mock("../../../parity/ReferenceSelect", () => ({
  ReferenceSelect: ({ value, options }: { value: string | null; options: Array<{ value: string; label: string }> }) => (
    <select aria-label="ref" value={value ?? ""} onChange={() => {}}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const line = (over: Partial<CategoryLine> = {}): CategoryLine => ({
  id: "a-1",
  expense_category_uuid: "acct-tires",
  description: "Tire",
  quantity: 1,
  unit_cost: 300,
  amount: 300,
  ...over,
});

function renderBox(lines: CategoryLine[], onSectionAItemChange = vi.fn()) {
  render(
    <CostBreakdownBox
      sectionA={{ lines }}
      sectionB={{ lines: [] }}
      operatingCompanyId="co-1"
      variant="wo"
      partsLaborMode="parts-and-labor"
      onSectionAChange={vi.fn()}
      onSectionBChange={vi.fn()}
      onSectionAItemChange={onSectionAItemChange}
    />
  );
  return onSectionAItemChange;
}

describe("CostBreakdownBox (WO) — Section A category line item", () => {
  it("exactly one item posts to the category's account -> that item is set on the line", async () => {
    itemsForAccount = { "acct-tires": [{ id: "item-tires", name: "Tires" }] };
    const onItem = renderBox([line()]);
    await waitFor(() => expect(onItem).toHaveBeenCalledWith("a-1", "item-tires"));
    expect(itemQueryCalls.some((c) => c.expenseAccountId === "acct-tires")).toBe(true);
  });

  it("several items post to the account -> nothing is guessed, the operator is told to pick", async () => {
    itemsForAccount = { "acct-tires": [{ id: "item-steer", name: "Steer tire" }, { id: "item-drive", name: "Drive tire" }] };
    const onItem = renderBox([line()]);
    expect(await screen.findByTestId("wo-section-a-item-hint-a-1")).toHaveTextContent(/2 items post to this category/);
    expect(onItem).not.toHaveBeenCalled();
  });

  it("no item posts to the account -> the operator is told, nothing is set", async () => {
    itemsForAccount = {};
    const onItem = renderBox([line()]);
    expect(await screen.findByTestId("wo-section-a-item-hint-a-1")).toHaveTextContent(/No item posts to this category's account/);
    expect(onItem).not.toHaveBeenCalled();
  });

  it("a line that already names its item keeps it (no re-pick)", async () => {
    itemsForAccount = { "acct-tires": [{ id: "item-tires", name: "Tires" }] };
    const onItem = renderBox([line({ item_id: "item-tires" })]);
    expect(screen.getByTestId("wo-section-a-item-a-1")).toBeInTheDocument();
    expect(onItem).not.toHaveBeenCalled();
  });
});
