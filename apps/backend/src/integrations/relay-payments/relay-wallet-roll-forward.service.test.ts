import { describe, expect, it } from "vitest";
import { buildRollForward, type DepositRow, type FillRow } from "./relay-wallet-roll-forward.service.js";

// ROUND 443.29 c: deposits − fills − fees = balance, by day; the deposit's 3.25% fee is charged to the card, not the
// wallet; a lumper code is its own column (amount + fee); fees come from Relay's reported fees[] (one rule).

const fill = (id: string, day: string, paid: number, fee: string, is_lumper = false): FillRow =>
  ({ id, transaction_id: id, day, paid_cents: paid, fees: [{ type: "relay_fee", amount: fee }], line_fee_cents: [], is_lumper });
const dep = (id: string, day: string, amount: number, fee: number): DepositRow => ({ id, deposit_id: id, day, amount_cents: amount, fee_cents: fee });

describe("buildRollForward (443.29 c)", () => {
  it("balance = deposits − fuel − fill fees − lumper, running by day; deposit fee never touches the wallet", () => {
    const rf = buildRollForward(
      [fill("f1", "2026-08-03", 61616, "2.00"), fill("f2", "2026-08-04", 1525, "1.50"), fill("l1", "2026-08-04", 26000, "5.00", true)],
      [dep("d1", "2026-08-03", 120000, 3900), dep("d2", "2026-08-04", 50000, 1625)]
    );
    expect(rf.totals).toEqual({ deposits_cents: 170000, deposit_fees_cents: 5525, fills_cents: 63141, fill_fees_cents: 350, lumper_cents: 26500, balance_cents: 170000 - 63141 - 350 - 26500 });
    expect(rf.days.map((d) => [d.day, d.balance_cents])).toEqual([["2026-08-03", 120000 - 61616 - 200], ["2026-08-04", 170000 - 63141 - 350 - 26500]]);
  });
  it("every number lists its documents", () => {
    const rf = buildRollForward([fill("f1", "2026-08-03", 1000, "2.00")], [dep("d1", "2026-08-03", 5000, 163)]);
    expect(rf.days[0]!.deposits).toEqual([{ id: "d1", ref: "d1", cents: 5000 }]);
    expect(rf.days[0]!.fills).toEqual([{ id: "f1", ref: "f1", cents: 1200 }]);
  });
});
