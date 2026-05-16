import { describe, expect, it } from "vitest";
import { buildQboExpensePurchasePayload } from "../expense.js";

describe("buildQboExpensePurchasePayload", () => {
  it("maps vendor purchase", () => {
    const p = buildQboExpensePurchasePayload({
      txnDate: "2026-05-07",
      totalAmount: 42.5,
      memo: "fuel",
      vendorQboId: "v99",
      expenseAccountQboId: "exp88",
    });
    expect(p.PaymentType).toBe("Cash");
    expect((p as { EntityRef?: { value: string } }).EntityRef?.value).toBe("v99");
  });
});
