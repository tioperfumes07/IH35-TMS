import { describe, expect, it } from "vitest";

import {
  I_DEDUCT_DISPUTES_SQL,
  I_DEDUCT_LINKS_SQL,
  iDeductExceptionForDispute,
  iDeductExceptionsForLink,
} from "../invariants/i-deduct-recovery-link-ties.js";
import { RECONCILER_INVARIANTS } from "../registry.js";

const clean = {
  link_id: "11111111-1111-4111-8111-111111111111",
  dispute_id: "22222222-2222-4222-8222-222222222222",
  invoice_label: "13578",
  created_at: "2026-09-23T03:00:00Z",
  recovered_cents: "56000",
  line_gone: false,
  invoice_voided: false,
  fault_party: "driver",
  disputed_cents: "56000",
  dispute_recovered_cents: "56000",
  deduction_voided: false,
  deduction_cents: "56000",
};

const fields = (row: typeof clean) => iDeductExceptionsForLink(row).map((e) => e.field);

describe("I-DEDUCT — a driver recovery still ties to the short-pay it recovers", () => {
  it("is registered in the reconciler", () => {
    expect(RECONCILER_INVARIANTS.map((i) => i.id)).toContain("I-DEDUCT");
  });

  it("a link that still ties raises nothing", () => {
    expect(iDeductExceptionsForLink(clean)).toEqual([]);
  });

  it("the causing invoice line removed", () => {
    expect(fields({ ...clean, line_gone: true })).toEqual(["invoice_line_gone"]);
  });

  it("the invoice voided", () => {
    expect(fields({ ...clean, invoice_voided: true })).toEqual(["invoice_voided"]);
  });

  it("fault re-decided away from the driver after the link was written", () => {
    const [e] = iDeductExceptionsForLink({ ...clean, fault_party: "carrier" });
    expect(e.field).toBe("fault_not_driver");
    expect(e.reason).toContain("carrier fault");
  });

  it("the live links on one dispute exceed the short-pay, with the excess as the amount", () => {
    const [e] = iDeductExceptionsForLink({ ...clean, disputed_cents: "50000", dispute_recovered_cents: "56000" });
    expect(e.field).toBe("over_recovered");
    expect(e.amount_cents).toBe(6000);
    expect(e.amount_source).toBe("accounting.invoice_disputes.disputed_amount_cents");
  });

  it("the recovering driver deduction voided while the link stays live", () => {
    expect(fields({ ...clean, deduction_voided: true })).toEqual(["deduction_voided"]);
  });

  it("the link claims more than the deduction charges", () => {
    const [e] = iDeductExceptionsForLink({ ...clean, deduction_cents: "50000" });
    expect(e.field).toBe("deduction_short");
    expect(e.amount_cents).toBe(6000);
  });

  it("keys are stable per link and field, and name the invoice, never a UUID, when there is one", () => {
    const [e] = iDeductExceptionsForLink({ ...clean, line_gone: true });
    expect(e.key).toBe(`I-DEDUCT/recovery_link/${clean.link_id}/invoice_line_gone`);
    expect(e.entity_label).toBe("13578");
    expect(e.reason.startsWith("Invoice 13578:")).toBe(true);
  });

  it("reverse direction: a driver-fault short-pay with no live recovery", () => {
    const e = iDeductExceptionForDispute({
      dispute_id: clean.dispute_id,
      invoice_label: "13589",
      fault_decided_at: "2026-09-20T00:00:00Z",
      created_at: "2026-09-19T00:00:00Z",
      disputed_cents: "3000",
    });
    expect(e.field).toBe("driver_fault_unrecovered");
    expect(e.amount_cents).toBe(3000);
    expect(e.since_source).toBe("accounting.invoice_disputes.fault_decided_at");
  });

  it("every join is company-scoped and only live links count", () => {
    expect(I_DEDUCT_LINKS_SQL).toMatch(/WHERE l\.operating_company_id = \$1::uuid\s+AND l\.voided_at IS NULL/);
    for (const alias of ["d", "sd", "il", "i"]) {
      expect(I_DEDUCT_LINKS_SQL).toContain(`${alias}.operating_company_id = l.operating_company_id`);
    }
    expect(I_DEDUCT_DISPUTES_SQL).toContain("d.operating_company_id = $1::uuid");
    expect(I_DEDUCT_DISPUTES_SQL).toContain("l.operating_company_id = d.operating_company_id");
    expect(I_DEDUCT_DISPUTES_SQL).toContain("l.voided_at IS NULL");
  });
});
