import { describe, expect, it } from "vitest";
import { FUEL_TYPE_FOR_RELAY_KIND, RELAY_REEFER_MAX_GALLONS, relayLineKind, relayLineKindSql, relayLineReeferOverTank, relayLineReeferOverTankSql } from "../relay-product-kind.js";

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
  it("ACCT-F11107: a reefer-coded line over 60 gal is truck diesel and flagged for review; at or under 60 the feed decides", () => {
    expect(RELAY_REEFER_MAX_GALLONS).toBe(60);
    // prod 2026-11-10: txn_Eznea2z1Qaxt1C 173.839 gal coded 033 "Reefer" — the Dreamline pump receipt says diesel (old code: reefer)
    expect(relayLineKind({ fuel_type: "reefer", fuel_product_code: "033", fuel_type_description: "Reefer", volume: "173.839" })).toBe("diesel");
    expect(relayLineReeferOverTank({ fuel_type: "reefer", volume: 60.001 })).toBe(true);
    expect(relayLineKind({ fuel_type: "reefer", volume: 60 })).toBe("reefer");
    expect(relayLineReeferOverTank({ fuel_type: "reefer", volume: 60 })).toBe(false);
    expect(relayLineKind({ fuel_type: "reefer", volume: 21.097 })).toBe("reefer");
    expect(relayLineReeferOverTank({ fuel_type: "diesel", volume: 150 })).toBe(false);
    expect(relayLineKind({ fuel_type: "def", volume: 80 })).toBe("def");
    expect(relayLineKindSql("x")).toMatch(/x\.volume, 0\) > 60/);
    expect(relayLineReeferOverTankSql("x")).toMatch(/x\.volume, 0\) > 60/);
  });
});
