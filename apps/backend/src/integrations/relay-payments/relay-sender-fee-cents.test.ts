import { describe, expect, it } from "vitest";
import {
  relayFillFeeCents,
  relayWalletDrawdownCents,
  sumRelayFeesArrayCents,
} from "./relay-sender-fee-cents.js";

describe("RELAY-F442 — sender_fee cents", () => {
  it("reads fees[] dollar strings (txn_4ypX8FQCRzHr5n shape: $2.00)", () => {
    expect(sumRelayFeesArrayCents([{ type: "sender_fee", amount: "2.00" }], "txn_4ypX8FQCRzHr5n")).toBe(200);
  });

  it("prefers fees[] over line fees so the same sender_fee is not double-counted", () => {
    expect(
      relayFillFeeCents({
        transaction_id: "txn_4ypX8FQCRzHr5n",
        fees: [{ type: "sender_fee", amount: "2.00" }],
        line_fee_amount_cents: [200, null],
      }),
    ).toBe(200);
  });

  it("falls back to sum of line fee_amount_cents when fees[] is empty", () => {
    expect(
      relayFillFeeCents({
        transaction_id: "t1",
        fees: [],
        line_fee_amount_cents: [200, 0, null],
      }),
    ).toBe(200);
  });

  it("wallet drawdown = fuel paid + fee (594.33 + 2.00 = 596.33)", () => {
    expect(relayWalletDrawdownCents(59433, 200)).toBe(59633);
  });
});
