import { describe, expect, it } from "vitest";
import { relayServiceKindOf, relayServiceProductCents } from "../relay-service-code.js";

describe("ACCT-F11127 relayServiceKindOf", () => {
  it("names lumper / scales from Relay's products in both shapes", () => {
    expect(relayServiceKindOf({ fuel_code_type: "One-time lumper", products: [{ name: "Lumper" }] })).toBe("lumper");
    expect(relayServiceKindOf({ fuel_code_type: "One-time fuel", products: [{ name: "Cat Scales" }] })).toBe("scales");
    expect(relayServiceKindOf({ fuel_code_type: "one_time", products: [{ product_type: "scales", product_type_description: "CAT Scales", purchase_price_total: "15.25" }] })).toBe("scales");
    expect(relayServiceKindOf({ fuel_code_type: "One-time lumper", products: [] })).toBe("lumper");
  });
  it("is null for fuel (any fuel product present) and for nothing named", () => {
    expect(relayServiceKindOf({ fuel_code_type: "One-time fuel", products: [{ name: "DEF, Diesel" }] })).toBeNull();
    expect(relayServiceKindOf({ fuel_code_type: "one_time", products: [] })).toBeNull();
    expect(relayServiceKindOf({ fuel_code_type: "one_time", products: [{ name: "Cat Scales" }, { name: "Diesel" }] })).toBeNull();
  });
  it("Relay's product price in cents", () => {
    expect(relayServiceProductCents([{ purchase_price_total: "15.25" }])).toBe(1525);
    expect(relayServiceProductCents([{ name: "Lumper" }])).toBeNull();
  });
});
