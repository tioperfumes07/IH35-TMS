import { describe, expect, it } from "vitest";
import { buildQboCreditMemoPayload } from "../credit_memo.js";

describe("buildQboCreditMemoPayload", () => {
  it("credit memo with remaining credit", () => {
    const p = buildQboCreditMemoPayload({
      customerQboId: "c1",
      txnDate: "2026-05-05",
      docNumber: "CM-2026-0001",
      totalCents: 2500,
      defaultItemQboId: "item-1",
      remainingCreditCents: 2500,
    });
    expect(p.DocNumber).toBe("CM-2026-0001");
    expect(p.RemainingCredit).toBe(25);
  });
});
