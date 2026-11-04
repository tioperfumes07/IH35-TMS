import { describe, expect, it } from "vitest";
import { canVoidStrayPractical, reasonIsValid, type VoidStrayPracticalBill } from "./VoidStrayPracticalBillAction";

const base: VoidStrayPracticalBill = { status: "open", voided_at: null, settled_in_settlement_id: null, miles_basis_type: "practical" };

describe("ACCT-F11079 void practical-miles bill action visibility", () => {
  it("shows for an open, unvoided, unsettled practical bill for Owner/Administrator/Accountant", () => {
    for (const role of ["Owner", "Administrator", "Accountant"]) expect(canVoidStrayPractical(base, role)).toBe(true);
  });
  it("hides for other roles or no role", () => {
    for (const role of ["Dispatcher", "Driver", "", null, undefined]) expect(canVoidStrayPractical(base, role)).toBe(false);
  });
  it("hides when not open, voided, settled, or not practical", () => {
    expect(canVoidStrayPractical({ ...base, status: "paid" }, "Owner")).toBe(false);
    expect(canVoidStrayPractical({ ...base, voided_at: "2026-11-03T00:00:00Z" }, "Owner")).toBe(false);
    expect(canVoidStrayPractical({ ...base, settled_in_settlement_id: "s1" }, "Owner")).toBe(false);
    expect(canVoidStrayPractical({ ...base, miles_basis_type: "loaded" }, "Owner")).toBe(false);
    expect(canVoidStrayPractical({ ...base, miles_basis_type: null }, "Owner")).toBe(false);
  });
  it("requires a reason of at least 20 trimmed characters", () => {
    expect(reasonIsValid("")).toBe(false);
    expect(reasonIsValid("   short   ")).toBe(false);
    expect(reasonIsValid("x".repeat(19))).toBe(false);
    expect(reasonIsValid("x".repeat(20))).toBe(true);
  });
});
