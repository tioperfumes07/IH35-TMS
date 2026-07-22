import { describe, expect, it } from "vitest";
import { buildVendorBillLinePayloads } from "./vendorBillLines";
import type { TwoSectionLine } from "../forms/TwoSectionLineEditor";

describe("buildVendorBillLinePayloads", () => {
  it("maps Section A CoA category to account_id + amount_cents", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "A",
        description: "Diesel",
        quantity: 1,
        unit_cost: 100,
        amount: 100,
        expense_category_uuid: "11111111-1111-4111-8111-111111111111",
      },
    ];
    expect(buildVendorBillLinePayloads(lines)).toEqual([
      {
        section: "A",
        amount_cents: 10000,
        description: "Diesel",
        account_id: "11111111-1111-4111-8111-111111111111",
        expense_category_uuid: "11111111-1111-4111-8111-111111111111",
      },
    ]);
  });

  it("flattens Section B sub_rows into separate lines without inventing accounts", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "2",
        section: "B",
        description: "Service",
        quantity: 1,
        unit_cost: 0,
        amount: 0,
        service_item_uuid: "22222222-2222-4222-8222-222222222222",
        sub_rows: [
          {
            id: "s1",
            line_type: "parts",
            description: "Filter",
            quantity: 1,
            unit_cost: 25,
            amount: 25,
          },
          {
            id: "s2",
            line_type: "labor",
            description: "Labor",
            quantity: 1,
            unit_cost: 75,
            amount: 75,
          },
        ],
      },
    ];
    const payload = buildVendorBillLinePayloads(lines);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ section: "B", amount_cents: 2500, description: "Filter" });
    expect(payload[0]).not.toHaveProperty("account_id");
    expect(payload[1]).toMatchObject({ section: "B", amount_cents: 7500, description: "Labor" });
  });

  it("skips zero-amount lines", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "3",
        section: "A",
        description: "empty",
        quantity: 1,
        unit_cost: 0,
        amount: 0,
        expense_category_uuid: "11111111-1111-4111-8111-111111111111",
      },
    ];
    expect(buildVendorBillLinePayloads(lines)).toEqual([]);
  });
});
