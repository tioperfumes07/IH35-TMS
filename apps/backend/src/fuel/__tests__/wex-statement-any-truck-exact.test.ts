// LEAD 443.202 — the WEX rail reaches ANOTHER truck's receipt only at the exact amount. Measured 10-21 on a prod fork:
// the Dreamline 3% fallback paired WEX 87359 (T171 10-11, ULSD gross 602.18) with T173's 618.16 Relay receipt and listed
// a real WEX fill cross_rail (never posted). Exact cents across trucks still pairs (WEX coded 99534661 as unit 173; T170).
import { describe, expect, it } from "vitest";
import { matchBookedReceipt, type BookedReceipt } from "../dreamline-statement-import.service.js";

const receipt = (id: string, unit: string, cents: number, d = "2026-10-10"): BookedReceipt => ({
  expense_id: id, expense_number: null, d, unit_norm: unit, kind: "diesel", cents, rail: "other_rail", fuel_transaction_id: null, notes: null,
});
const line = { local_date: "2026-10-11", unit_label: "171", product: "diesel" as const, gross_cents: 60218, net_cents: 56570 };

describe("matchBookedReceipt — any-truck scope (443.202)", () => {
  it("Dreamline (any_truck) still takes the only other-truck receipt within 3%", () => {
    expect(matchBookedReceipt(line, [receipt("r-T173", "173", 61816)], new Set(), "any_truck")?.expense_id).toBe("r-T173");
  });
  it("WEX (any_truck_exact) never takes another truck's receipt by a near amount", () => {
    expect(matchBookedReceipt(line, [receipt("r-T173", "173", 61816)], new Set(), "any_truck_exact")).toBeNull();
  });
  it("WEX still pairs another truck's receipt at the exact amount (unit miscoded on the card)", () => {
    const miscoded = { local_date: "2026-10-16", unit_label: "173", product: "diesel" as const, gross_cents: 90615, net_cents: 90615 };
    expect(matchBookedReceipt(miscoded, [receipt("r-T170", "170", 90615, "2026-10-16")], new Set(), "any_truck_exact")?.expense_id).toBe("r-T170");
  });
});
