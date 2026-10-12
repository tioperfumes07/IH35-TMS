/**
 * LEAD 443.116 (c) — pure rules of the delivery accrual and of the close that applies to it (locked design READ-FIRST §3:
 * a cost is recognized once, on the day incurred). Real-Postgres proof: settlement-payrun-close.db.test.ts (7)-(9).
 */
import { describe, expect, it } from "vitest";
import { driverPayAccrualLines } from "../driver-pay-delivery-accrual.service.js";
import { splitLoadLinesAgainstDeliveryAccrual, SettlementApChainError, type ApChainBillLine } from "../settlement-ap-chain.service.js";

const pay = (cents: number, description = "linehaul earnings", itemId: string | null = "item-loaded"): ApChainBillLine => ({ kind: "pay", accountId: "acct-6890", amountCents: cents, description, itemId });

describe("443.116 (c) — delivery accrual lines", () => {
  it("bills the loaded and empty components on their own items when they tie to the gross", () => {
    expect(driverPayAccrualLines({ gross: 120_000, loaded: 100_000, deadhead: 20_000 })).toEqual([
      { component: "loaded", cents: 100_000 },
      { component: "empty", cents: 20_000 },
    ]);
  });
  it("bills one line for the gross when the components do not tie (never invents a split)", () => {
    expect(driverPayAccrualLines({ gross: 120_000, loaded: 90_000, deadhead: 20_000 })).toEqual([{ component: null, cents: 120_000 }]);
    expect(driverPayAccrualLines({ gross: 50_000, loaded: null, deadhead: null })).toEqual([{ component: null, cents: 50_000 }]);
  });
});

describe("443.116 (c) — close applies to the delivery bill; pay is never posted twice", () => {
  it("pay equal to the accrual leaves nothing for the close to post", () => {
    expect(splitLoadLinesAgainstDeliveryAccrual([pay(300_000)], 300_000, "13601").supplement).toEqual([]);
  });
  it("extra pay above the accrual and reimbursements post on the supplement; the covered pay does not", () => {
    const reimb: ApChainBillLine = { kind: "reimbursement", accountId: "acct-5300", amountCents: 4_500, description: "tolls", itemId: null };
    const { supplement } = splitLoadLinesAgainstDeliveryAccrual([pay(300_000), pay(5_000, "extra pay", "item-extra"), reimb], 300_000, "13601");
    expect(supplement).toEqual([pay(5_000, "extra pay", "item-extra"), reimb]);
  });
  it("a pay line straddling the accrual is split on the same item", () => {
    const { supplement } = splitLoadLinesAgainstDeliveryAccrual([pay(310_000)], 300_000, "13601");
    expect(supplement).toEqual([{ ...pay(10_000), description: "linehaul earnings (above delivery accrual)" }]);
  });
  it("pay below the accrual is refused by name, never silently under-applied", () => {
    expect(() => splitLoadLinesAgainstDeliveryAccrual([pay(290_000)], 300_000, "13601")).toThrowError(SettlementApChainError);
    try {
      splitLoadLinesAgainstDeliveryAccrual([pay(290_000)], 300_000, "13601");
    } catch (e) {
      expect((e as SettlementApChainError).code).toBe("PAY_BELOW_DELIVERY_ACCRUAL");
    }
  });
});
