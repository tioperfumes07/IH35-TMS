import { describe, expect, it } from "vitest";
import { attributeFuelLoadNumber, fuelLoadCandidates, lineLoadRefusal } from "../settlement-creator-line-load.js";

// Settlement 5769 shape: 13498 picked 08/04 delivered 08/05; 13508 picked 08/06 delivered 08/07.
const loads = [
  { load_number: "13498", pickup_date: "2026-08-04", delivery_date: "2026-08-05" },
  { load_number: "13508", pickup_date: "2026-08-06", delivery_date: "2026-08-07" },
];

describe("ROUND 443.5 — every deduction, admin fee and fuel line carries its load", () => {
  it("5769: diesel 08/06 $503.67 and 08/07 $774.55 both attribute to 13508", () => {
    expect(attributeFuelLoadNumber(loads, { date: "2026-08-06", invoice: "A" })).toBe("13508");
    expect(attributeFuelLoadNumber(loads, { date: "2026-08-07", invoice: "B" })).toBe("13508");
  });
  it("a typed load number wins", () => {
    expect(attributeFuelLoadNumber(loads, { date: "2026-08-07", load_number: "13498" })).toBe("13498");
  });
  it("a fill covered by two loads is refused naming the fill, the date and the candidates — never the first load", () => {
    const overlap = [...loads, { load_number: "13510", pickup_date: "2026-08-07", delivery_date: "2026-08-08" }];
    expect(fuelLoadCandidates(overlap, "2026-08-07")).toEqual(["13508", "13510"]);
    expect(() => attributeFuelLoadNumber(overlap, { date: "2026-08-07", vendor_name: "Loves", invoice: "2870483" })).toThrow(/Loves 2870483 on 2026-08-07: loads 13508, 13510/);
  });
  it("a fill no load covers is refused", () => {
    expect(() => attributeFuelLoadNumber(loads, { date: "2026-08-20" })).toThrow(/no load of this settlement covers/);
  });
  it("a deduction with no load is refused (escrow $25 + admin fee $10 on 13508 pass)", () => {
    expect(lineLoadRefusal({ loads, deductions: [{ description: "Admin fee", amount_cents: 1000, load_number: "13508" }] })).toBeNull();
    expect(lineLoadRefusal({ loads, deductions: [{ description: "Tolls", amount_cents: 1000 }] })?.code).toBe("deduction_load_required");
  });
  it("a separate admin_fee_cents is refused — alone (no load) or alongside an Admin fee line (double entry)", () => {
    expect(lineLoadRefusal({ loads, admin_fee_cents: 1000 })?.message).toMatch(/deduction line with its load/);
    expect(lineLoadRefusal({ loads, admin_fee_cents: 1000, deductions: [{ description: "Admin fee", amount_cents: 1000, load_number: "13508" }] })?.message).toMatch(/entered twice/);
  });
});
