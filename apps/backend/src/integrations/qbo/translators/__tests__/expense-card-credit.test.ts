// LEAD 443.258.5 (writer shape B): a card credit syncs as QBO "Credit Card Credit" (Purchase, Credit=true) on its card
// account — never a VendorCredit; an ordinary expense is unchanged.
import { describe, expect, it } from "vitest";
import { buildQboExpensePurchasePayload } from "../expense.js";

describe("buildQboExpensePurchasePayload — card credit", () => {
  const base = { txnDate: "2026-09-19", totalAmount: 38.75, memo: "Dreamline statement x — card discount", vendorQboId: "V1", expenseAccountQboId: "A5000" };
  it("an ordinary expense stays a cash Purchase", () => {
    const p = buildQboExpensePurchasePayload(base);
    expect(p.PaymentType).toBe("Cash");
    expect(p).not.toHaveProperty("Credit");
  });
  it("a card credit is a CreditCard Purchase with Credit=true on the card account", () => {
    const p = buildQboExpensePurchasePayload({ ...base, isCredit: true, paymentAccountQboId: "A2510" });
    expect(p).toMatchObject({ PaymentType: "CreditCard", Credit: true, AccountRef: { value: "A2510" } });
    expect((p.Line as Array<{ AccountBasedExpenseLineDetail: { AccountRef: { value: string } } }>)[0].AccountBasedExpenseLineDetail.AccountRef.value).toBe("A5000");
  });
});
