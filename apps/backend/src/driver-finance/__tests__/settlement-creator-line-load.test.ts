import { describe, expect, it } from "vitest";
import { attributeFuelLoadNumber, creatorLineLoadNumber, fuelLoadCandidates, lineLoadNotFound, lineLoadRefusal } from "../settlement-creator-line-load.js";

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

import { companyExpenseRefusal } from "../settlement-creator-line-load.js";
import { milesTimesRateCents } from "../deadhead-rule.js";
describe("ROUND 443.6 — a company expense names how it was paid and its vendor", () => {
  const def = { item_name: "DEF", amount_cents: 6784, is_company_expense: true, vendor_name: "Loves" };
  it("no payment source -> refused (no Relay default)", () => {
    expect(companyExpenseRefusal([{ ...def, card: null }])?.code).toBe("expense_payment_source_required");
  });
  it("no vendor -> refused", () => {
    expect(companyExpenseRefusal([{ ...def, card: "relay", vendor_name: "" }])?.code).toBe("expense_vendor_required");
  });
  it("relay / dreamline / owed with a vendor pass admission", () => {
    for (const card of ["relay", "dreamline", "owed"]) expect(companyExpenseRefusal([{ ...def, card }])).toBeNull();
  });
  it("a driver reimbursement is not a company expense", () => {
    expect(companyExpenseRefusal([{ ...def, is_company_expense: false, card: null }])).toBeNull();
  });
  it("5769 DEF $67.84 in gallons prices exactly (rate to 4 decimals, Postgres numeric rounding)", () => {
    const qty = 15.432;
    const rate = Number((6784 / qty).toFixed(4));
    expect(milesTimesRateCents(qty, rate)).toBe(6784);
  });
});

describe("443.110 G5 — reimbursement / reimbursable expense / additional pay / fuel carry their load or refuse", () => {
  it("a typed load number wins", () => {
    expect(creatorLineLoadNumber(loads, { label: "Reimbursement", load_number: "13498", date: "2026-08-07" })).toBe("13498");
  });
  it("a dated line takes the one load of this settlement covering that date (the load the driver was on)", () => {
    expect(creatorLineLoadNumber(loads, { label: "Reimbursable expense", date: "2026-08-07" })).toBe("13508");
  });
  it("a dated line no load covers, or two loads cover, is refused — never the first load", () => {
    expect(() => creatorLineLoadNumber(loads, { label: "Reimbursable expense \"Lumper\"", date: "2026-08-20" })).toThrow(/Lumper.*no load of this settlement covers/);
    const overlap = [...loads, { load_number: "13510", pickup_date: "2026-08-07", delivery_date: "2026-08-08" }];
    expect(() => creatorLineLoadNumber(overlap, { label: "X", date: "2026-08-07" })).toThrow(/13508, 13510/);
  });
  it("an undated line takes the settlement's only load; with several loads it is refused", () => {
    expect(creatorLineLoadNumber([loads[0]!], { label: "Additional pay" })).toBe("13498");
    expect(() => creatorLineLoadNumber(loads, { label: "Additional pay \"Bonus\"" })).toThrow(/Bonus.*type its load number/);
    try { creatorLineLoadNumber(loads, { label: "x" }); } catch (e) { expect((e as { code?: string }).code).toBe("line_load_unresolved"); }
  });
  it("a line picked by id is resolved by the caller (no number)", () => {
    expect(creatorLineLoadNumber(loads, { label: "x", load_id: "00000000-0000-0000-0000-000000000001" })).toBeNull();
  });
  it("an unknown typed load is refused naming the line and the number", () => {
    expect(lineLoadNotFound("Reimbursement \"Scale\"", "99999").message).toMatch(/Reimbursement "Scale": load 99999 is not a load of this company/);
  });
});
