import { describe, expect, it } from "vitest";
import {
  LUMPER_EXPENSE_ACCOUNT,
  LUMPER_INCOME_ACCOUNT,
  journalBalances,
  lumperNetToCarrierCents,
  lumperPostingJournal,
} from "../lumper-posting-rules";

// $300 lumper = 30000 cents (the block's $3000 trip + $300 lumper context).
const AMT = 30000;

describe("lumper-posting-rules — STEP 4 balanced JE per scenario (Jorge money-check)", () => {
  it("S1 broker/comcheck: NO posting (broker's money never touches our books)", () => {
    const legs = lumperPostingJournal("broker_direct", AMT, false);
    expect(legs).toEqual([]);
    expect(journalBalances(legs)).toBe(true); // vacuously balanced
    expect(lumperNetToCarrierCents(legs)).toBe(0);
  });

  it("S2 we-pay-bill (itemized): DR QBO-117/CR Bank + DR AR/CR QBO-1150040160 — passthrough, BALANCED, net ~$0", () => {
    const legs = lumperPostingJournal("carrier_bill", AMT, false);
    expect(legs).toHaveLength(4);
    expect(journalBalances(legs)).toBe(true); // DR 600 = CR 600
    expect(legs.filter((l) => l.side === "debit").reduce((a, l) => a + l.amount_cents, 0)).toBe(60000);
    expect(legs.filter((l) => l.side === "credit").reduce((a, l) => a + l.amount_cents, 0)).toBe(60000);
    // the four accounts: DR QBO-117, CR Bank, DR AR, CR QBO-1150040160
    expect(legs.find((l) => l.account_ref === LUMPER_EXPENSE_ACCOUNT && l.side === "debit")?.amount_cents).toBe(AMT);
    expect(legs.find((l) => l.account_ref === LUMPER_INCOME_ACCOUNT && l.side === "credit")?.amount_cents).toBe(AMT);
    expect(lumperNetToCarrierCents(legs)).toBe(0); // $300 income − $300 expense = $0 (true passthrough)
  });

  it("S2 we-pay-bill FLAT-RATE customer: DR QBO-117/CR Bank only (AR/income suppressed) — BALANCED, net −$300", () => {
    const legs = lumperPostingJournal("carrier_bill", AMT, true);
    expect(legs).toHaveLength(2);
    expect(journalBalances(legs)).toBe(true); // DR 300 = CR 300
    expect(legs.some((l) => l.account_ref === LUMPER_INCOME_ACCOUNT)).toBe(false); // no income leg
    expect(lumperNetToCarrierCents(legs)).toBe(-AMT); // cost only, covered by the flat rate
  });

  it("S3 absorb: DR QBO-117/CR Bank only — BALANCED, net −$300 (the only case lumper hits the P&L)", () => {
    const legs = lumperPostingJournal("carrier_absorb", AMT, false);
    expect(legs).toHaveLength(2);
    expect(journalBalances(legs)).toBe(true);
    expect(legs.some((l) => l.account_ref === LUMPER_INCOME_ACCOUNT)).toBe(false);
    expect(lumperNetToCarrierCents(legs)).toBe(-AMT);
  });

  it("every scenario JE balances across a sweep of amounts", () => {
    for (const amt of [1, 99, 15000, 30000, 999999]) {
      for (const sc of ["broker_direct", "carrier_bill", "carrier_absorb"] as const) {
        for (const flat of [false, true]) {
          expect(journalBalances(lumperPostingJournal(sc, amt, flat))).toBe(true);
        }
      }
    }
  });

  it("clamps negative/garbage amounts to no posting", () => {
    expect(lumperPostingJournal("carrier_bill", -500, false)).toEqual([]);
    expect(lumperPostingJournal("carrier_bill", Number.NaN, false)).toEqual([]);
  });
});
