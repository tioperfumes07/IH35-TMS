import { describe, expect, it } from "vitest";
import { buildQboBillPayload } from "../bill.js";

describe("buildQboBillPayload", () => {
  it("builds vendor bill with expense lines", () => {
    const p = buildQboBillPayload({
      vendorQboId: "v1",
      apAccountQboId: "ap1",
      txnDate: "2026-04-10",
      docNumber: "BILL-1",
      privateNote: "memo",
      totalCents: 12_500,
      lines: [{ amountCents: 12_500, description: "Fuel", accountQboId: "exp1" }],
    });
    expect(p.VendorRef).toEqual({ value: "v1" });
    expect(p.APAccountRef).toEqual({ value: "ap1" });
    expect(p.TotalAmt).toBe(125);
  });
});
