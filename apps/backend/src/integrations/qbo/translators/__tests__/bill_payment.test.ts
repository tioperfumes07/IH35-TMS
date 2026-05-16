import { describe, expect, it } from "vitest";
import { buildQboBillPaymentPayload } from "../bill_payment.js";

describe("buildQboBillPaymentPayload", () => {
  it("check-style bill payment", () => {
    const p = buildQboBillPaymentPayload({
      vendorQboId: "v1",
      txnDate: "2026-05-03",
      memo: "paid",
      totalCents: 900,
      payType: "Check",
      bankAccountQboId: "bank1",
      allocations: [{ billQboId: "bill-qbo", amountCents: 900 }],
    });
    expect(p.PayType).toBe("Check");
    expect((p as { CheckPayment?: { BankAccountRef?: { value: string } } }).CheckPayment?.BankAccountRef?.value).toBe(
      "bank1"
    );
  });
});
