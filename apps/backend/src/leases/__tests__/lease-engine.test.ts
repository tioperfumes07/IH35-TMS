import { describe, expect, it } from "vitest";
import { monthsInTerm, validateAgreement, type CreateLeaseAgreementInput } from "../lease-engine.service.js";
import { escalatedAmount, gateLeaseBill, groupIntoBills, type LeaseBillLinePlan } from "../lease-bill-engine.service.js";
import { monthsToBill } from "../lease.routes.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRK = "00000000-0000-4000-8000-0000000000b1";
const base: CreateLeaseAgreementInput = {
  lease_type: "truck_lease",
  billing_mode: "one_bill_all_units",
  lessor_operating_company_id: TRK,
  lessor_vendor_id: "00000000-0000-4000-8000-0000000000c1",
  commencement_date: "2026-04-01",
  end_date: "2027-03-31",
  assets: [{ unit_id: "00000000-0000-4000-8000-0000000000d1", monthly_amount_cents: 250000 }],
};
const line = (o: Partial<LeaseBillLinePlan> = {}): LeaseBillLinePlan => ({
  lease_contract_id: "L1", lease_asset_line_id: "A1", unit_id: "U1", equipment_id: null, asset_label: "T174", amount_cents: 250000, class_id: "C1", account_id: "X1", ...o,
});

describe("lease agreement rules", () => {
  it("a complete truck lease validates", () => expect(validateAgreement(base, USMCA)).toEqual([]));
  it("refuses a self-lease, a missing vendor, a reversed term, duplicates and mixed asset kinds", () => {
    expect(validateAgreement({ ...base, lessor_operating_company_id: USMCA }, USMCA).join()).toMatch(/cannot lease to itself/);
    expect(validateAgreement({ ...base, lessor_vendor_id: "" }, USMCA).join()).toMatch(/lessor vendor is required/);
    expect(validateAgreement({ ...base, end_date: "2026-03-01" }, USMCA).join()).toMatch(/before the commencement/);
    expect(validateAgreement({ ...base, assets: [base.assets[0], base.assets[0]] }, USMCA).join()).toMatch(/listed twice/);
    expect(validateAgreement({ ...base, assets: [{ equipment_id: "E1", monthly_amount_cents: 1 }] }, USMCA).join()).toMatch(/truck lease lists trucks/);
    expect(validateAgreement({ ...base, billing_mode: "weekly" as never }, USMCA).join()).toMatch(/billing_mode/);
  });
  it("term in months: 04/01/2026 – 03/31/2027 is 12", () => {
    expect(monthsInTerm("2026-04-01", "2027-03-31")).toBe(12);
    expect(monthsInTerm("2026-04-01", "2026-04-30")).toBe(1);
  });
});

describe("lease bill engine rules", () => {
  it("escalation steps every N months", () => {
    expect(escalatedAmount(100000, "2026-01-01", "2026-12-01", 300, 12)).toBe(100000);
    expect(escalatedAmount(100000, "2026-01-01", "2027-01-01", 300, 12)).toBe(103000);
    expect(escalatedAmount(100000, "2026-01-01", "2027-01-01", null, null)).toBe(100000);
  });
  it("gate refuses a bill missing vendor / account / class / amount, never posts half-formed", () => {
    const plan = { key: "C:L1:2026-04", lease_contract_id: "L1", lease_display: "L-1", vendor_id: "V1", period_start: "2026-04-01", lines: [line()] };
    expect(gateLeaseBill(plan)).toEqual({ ok: true });
    expect(gateLeaseBill({ ...plan, vendor_id: null })).toMatchObject({ ok: false, reason: expect.stringMatching(/vendor/) });
    expect(gateLeaseBill({ ...plan, lines: [line({ account_id: null })] })).toMatchObject({ ok: false, reason: expect.stringMatching(/rent_expense/) });
    expect(gateLeaseBill({ ...plan, lines: [line({ class_id: null })] })).toMatchObject({ ok: false, reason: expect.stringMatching(/class/) });
    expect(gateLeaseBill({ ...plan, lines: [line({ amount_cents: 0 })] })).toMatchObject({ ok: false });
  });
  it("billing mode: one bill for all units vs one bill per unit", () => {
    const c = { id: "L1", display: "L-1", vendor_id: "V1" };
    const lines = [line({ lease_asset_line_id: "A1" }), line({ lease_asset_line_id: "A2", asset_label: "T175" })];
    const all = groupIntoBills({ ...c, billing_mode: "one_bill_all_units" }, "2026-04-01", lines);
    expect(all).toHaveLength(1);
    expect(all[0].key).toBe("C:L1:2026-04");
    expect(all[0].lines).toHaveLength(2);
    const per = groupIntoBills({ ...c, billing_mode: "one_bill_per_unit" }, "2026-04-01", lines);
    expect(per.map((p) => p.key)).toEqual(["A:A1:2026-04", "A:A2:2026-04"]);
  });
  it("backdated contract bills every month from commencement through the current month", () => {
    expect(monthsToBill("2026-07-15", "2026-10-01")).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
  });
});
