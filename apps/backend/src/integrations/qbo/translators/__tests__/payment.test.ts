import { describe, expect, it } from "vitest";
import { buildQboPaymentPayload } from "../payment.js";

describe("buildQboPaymentPayload", () => {
  it("links invoice payments", () => {
    const p = buildQboPaymentPayload({
      customerQboId: "c1",
      totalCents: 40_000,
      paymentDate: "2026-05-02",
      depositToAccountQboId: "dep1",
      allocations: [{ invoiceQboId: "inv-qbo", amountCents: 40_000 }],
    });
    expect(p.CustomerRef).toEqual({ value: "c1" });
    expect(p.DepositToAccountRef).toEqual({ value: "dep1" });
    expect((p.Line as unknown[]).length).toBe(1);
  });
});
