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

// Round 92/94 — item lines remainder: a Section B line with a real catalog item picked and a
// real quantity carries item_id/quantity/rate_cents/unit_of_measure, computed the same way the
// DB's own CHECK verifies it (round(quantity * rate_cents) = round(amount * 100)).
describe("buildVendorBillLinePayloads — item lines remainder (Round 92/94)", () => {
  it("carries item_id/quantity/rate_cents/unit_of_measure when a catalog item + real quantity are set", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "B",
        description: "Diesel",
        quantity: 115,
        unit_cost: 6.68,
        amount: 768.2,
        service_item_uuid: "33333333-3333-4333-8333-333333333333",
      },
    ];
    const payload = buildVendorBillLinePayloads(lines);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      section: "B",
      item_id: "33333333-3333-4333-8333-333333333333",
      quantity: 115,
      rate_cents: 668,
      unit_of_measure: "each",
    });
    // amount_cents is DERIVED from quantity * rate_cents, not the UI's own separately-rounded
    // `amount` field — guarantees the DB's round(quantity*rate_cents)=round(amount*100) check
    // holds by construction.
    expect(payload[0]!.amount_cents).toBe(Math.round(115 * 668));
  });

  it("does NOT send item_id/quantity/rate_cents when no catalog item is picked, even with a real quantity/unit_cost", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "B",
        description: "Misc service",
        quantity: 3,
        unit_cost: 50,
        amount: 150,
      },
    ];
    const payload = buildVendorBillLinePayloads(lines);
    expect(payload[0]).not.toHaveProperty("item_id");
    expect(payload[0]).not.toHaveProperty("quantity");
    expect(payload[0]).not.toHaveProperty("rate_cents");
    expect(payload[0]!.amount_cents).toBe(15000);
  });

  it("does NOT send item_id/quantity/rate_cents on a sub_rows (parts/labor) breakdown — different FK target (catalogs.parts/labor_rates, not catalogs.items)", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "B",
        description: "Service",
        quantity: 1,
        unit_cost: 0,
        amount: 0,
        service_item_uuid: "33333333-3333-4333-8333-333333333333",
        sub_rows: [{ id: "s1", line_type: "parts", description: "Filter", quantity: 2, unit_cost: 12.5, amount: 25 }],
      },
    ];
    const payload = buildVendorBillLinePayloads(lines);
    expect(payload).toHaveLength(1);
    expect(payload[0]).not.toHaveProperty("item_id");
    expect(payload[0]).not.toHaveProperty("quantity");
    expect(payload[0]!.amount_cents).toBe(2500);
  });

  it("does not invent an item line when quantity is zero, even with an item picked", () => {
    const lines: TwoSectionLine[] = [
      {
        id: "1",
        section: "B",
        description: "Diesel",
        quantity: 0,
        unit_cost: 6.68,
        amount: 0,
        service_item_uuid: "33333333-3333-4333-8333-333333333333",
      },
    ];
    expect(buildVendorBillLinePayloads(lines)).toEqual([]);
  });
});
