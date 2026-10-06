import { describe, expect, it } from "vitest";
import { FUEL_TYPE_FOR_RELAY_KIND, relayLineKind, relayLineKindSql } from "../relay-product-kind.js";

describe("ROUND 391.2 — one classifier for a Relay product line, from the feed", () => {
  it("reefer by type, by Relay product code 033, or by description", () => {
    expect(relayLineKind({ fuel_type: "reefer" })).toBe("reefer");
    expect(relayLineKind({ fuel_type: "reefer_2" })).toBe("reefer");
    expect(relayLineKind({ fuel_type: "other", fuel_product_code: "033" })).toBe("reefer");
    expect(relayLineKind({ fuel_type: null, fuel_type_description: "Reefer Diesel" })).toBe("reefer");
    expect(relayLineKind({ fuel_type: "diesel", fuel_type_description: "Refrigeration unit fuel" })).toBe("reefer");
  });
  it("DEF, diesel and other", () => {
    expect(relayLineKind({ fuel_type: "def" })).toBe("def");
    expect(relayLineKind({ fuel_type: "def_forecourt" })).toBe("def");
    expect(relayLineKind({ fuel_type: null, fuel_type_description: "Diesel Exhaust Fluid" })).toBe("def");
    expect(relayLineKind({ fuel_type: "diesel" })).toBe("diesel");
    expect(relayLineKind({ fuel_type: "scales" })).toBe("other");
  });
  it("reefer maps to the fuel row type the IFTA aggregator leaves out", () => {
    expect(FUEL_TYPE_FOR_RELAY_KIND.reefer).toBe("reefer_diesel");
  });
  it("the SQL twin carries the same three reefer signals", () => {
    const sql = relayLineKindSql("x");
    expect(sql).toMatch(/x\.fuel_type ILIKE 'reefer%'/);
    expect(sql).toMatch(/x\.fuel_product_code/);
    expect(sql).toMatch(/refriger/);
  });
});
