import { describe, expect, it } from "vitest";
import { buildQboBillPaymentApplyPayload } from "../bill-payment-mapper.service.js";

describe("bill-payment-mapper.service", () => {
  it("builds multi-bill ApplyToBills payload with totals", () => {
    const payload = buildQboBillPaymentApplyPayload({
      vendorQboId: "55",
      paymentDate: "2026-05-01",
      memo: "test",
      allocations: [
        { billId: "b1", qboBillId: "901", amountCents: 5000 },
        { billId: "b2", qboBillId: "902", amountCents: 2500 },
      ],
    });

    expect(payload.VendorRef.value).toBe("55");
    expect(payload.TotalAmt).toBeCloseTo(75);
    expect(payload.Line).toHaveLength(2);
    expect(payload.Line[0]?.LinkedTxn?.[0]?.TxnId).toBe("901");
    expect(payload.Line[1]?.LinkedTxn?.[0]?.TxnId).toBe("902");
  });

  it("rejects empty allocations", () => {
    expect(() =>
      buildQboBillPaymentApplyPayload({
        vendorQboId: "55",
        paymentDate: "2026-05-01",
        allocations: [],
      })
    ).toThrowError();
  });
});
