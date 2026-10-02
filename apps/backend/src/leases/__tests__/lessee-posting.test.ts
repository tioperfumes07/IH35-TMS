import { describe, expect, it } from "vitest";
import { allocateByShare, leaseTermMonths, legPair } from "../lessee-posting.service.js";
import { validateAgreement, type CreateLeaseAgreementInput } from "../lease-engine.service.js";

describe("ROUND 321 lease-to-own posting helpers", () => {
  it("term months run from the commencement month through the end month, inclusive", () => {
    expect(leaseTermMonths("2026-01-01", "2028-12-31")).toBe(36);
    expect(leaseTermMonths("2026-03-01", "2026-03-31")).toBe(1);
  });

  it("a contract-level purchase price splits across assets by monthly share, remainder on the last", () => {
    expect(allocateByShare(1_000_000, [250_000, 250_000, 500_000])).toEqual([250_000, 250_000, 500_000]);
    expect(allocateByShare(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocateByShare(500, [0, 0])).toEqual([0, 500]);
  });

  it("a JE leg pair balances, flips a negative amount and drops zero", () => {
    expect(legPair(0, "dr", "cr", null, "x")).toEqual([]);
    const pos = legPair(1234, "dr", "cr", "cls", "x");
    expect(pos.map((p) => [p.account_id, p.debit_or_credit, p.amount_cents])).toEqual([["dr", "debit", 1234], ["cr", "credit", 1234]]);
    const neg = legPair(-50, "dr", "cr", null, "x");
    expect(neg.map((p) => [p.account_id, p.debit_or_credit, p.amount_cents])).toEqual([["cr", "debit", 50], ["dr", "credit", 50]]);
  });

  it("a lease-to-own cannot be created without a discount rate and a purchase option (fixed needs its price)", () => {
    const base: CreateLeaseAgreementInput = {
      lease_type: "lease_to_own", billing_mode: "one_bill_per_unit", lessor_operating_company_id: "a", lessor_vendor_id: "v",
      commencement_date: "2026-01-01", end_date: "2028-12-31", assets: [{ unit_id: "u1", monthly_amount_cents: 250_000 }],
    };
    const p = validateAgreement(base, "b");
    expect(p.some((x) => /discount rate/.test(x))).toBe(true);
    expect(p.some((x) => /purchase option/.test(x))).toBe(true);
    expect(validateAgreement({ ...base, discount_rate_bps: 800, purchase_option_kind: "fixed" }, "b").some((x) => /needs its price/.test(x))).toBe(true);
    expect(validateAgreement({ ...base, discount_rate_bps: 800, purchase_option_kind: "fmv" }, "b")).toEqual([]);
    // truck / trailer leases are unchanged (no rate / option required)
    expect(validateAgreement({ ...base, lease_type: "truck_lease" }, "b")).toEqual([]);
  });
});
