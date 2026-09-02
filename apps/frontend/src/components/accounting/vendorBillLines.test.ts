import { describe, expect, it } from "vitest";
import { buildVendorBillLinePayloads, mapExpenseCatalogCodeToBillCategory } from "./vendorBillLines";
import type { TwoSectionLine } from "../forms/TwoSectionLineEditor";

describe("mapExpenseCatalogCodeToBillCategory", () => {
  it("maps FUEL/REPAIR to existing expense_category_account_map keys", () => {
    expect(mapExpenseCatalogCodeToBillCategory("FUEL")).toEqual({
      category_kind: "fuel",
      category_code: "fuel",
    });
    expect(mapExpenseCatalogCodeToBillCategory("REPAIR")).toEqual({
      category_kind: "maintenance",
      category_code: "maintenance",
    });
  });

  it("maps PERMIT to the permit category_kind/code and does not invent maps for unknown codes", () => {
    expect(mapExpenseCatalogCodeToBillCategory("PERMIT")).toEqual({
      category_kind: "permit",
      category_code: "permit",
    });
    expect(mapExpenseCatalogCodeToBillCategory("")).toBeNull();
  });
});

describe("buildVendorBillLinePayloads", () => {
  it("maps Section A catalog category to expense_category_uuid + map keys (not CoA as uuid)", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "A",
        description: "Diesel",
        quantity: 1,
        unit_cost: 100,
        amount: 100,
        expense_category_uuid: "11111111-1111-4111-8111-111111111111",
        expense_category_code: "FUEL",
      },
    ];
    expect(buildVendorBillLinePayloads(lines)).toEqual([
      {
        section: "A",
        amount_cents: 10000,
        description: "Diesel",
        expense_category_uuid: "11111111-1111-4111-8111-111111111111",
        category_kind: "fuel",
        category_code: "fuel",
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

  it("GO-18 (owner correction 2026-09-02, N1 gap): stamps load_id onto every Section A/B line when opened from a load's Add Bill entry point", () => {
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
      {
        id: "2",
        section: "B",
        description: "Service",
        quantity: 1,
        unit_cost: 50,
        amount: 50,
      },
    ];
    const payload = buildVendorBillLinePayloads(lines, "44444444-4444-4444-8444-444444444444");
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ section: "A", load_id: "44444444-4444-4444-8444-444444444444" });
    expect(payload[1]).toMatchObject({ section: "B", load_id: "44444444-4444-4444-8444-444444444444" });
  });

  it("omits load_id entirely when no defaultLoadId is given — every other bill-create caller (WO/claim/unit) unchanged", () => {
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
    expect(buildVendorBillLinePayloads(lines)[0]).not.toHaveProperty("load_id");
  });
});
