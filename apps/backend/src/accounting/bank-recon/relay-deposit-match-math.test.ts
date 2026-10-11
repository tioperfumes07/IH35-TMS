import { describe, expect, it } from "vitest";
import { relayDepositChargedCents, relayDepositFeeCents } from "./relay-deposit-match-math.js";

describe("relay-deposit-match-math", () => {
  it("computes 3.25% fee half-up and charged total for owner example", () => {
    const wallet = 12_110_000; // $121,100.00
    // Integer bps: (12110000 * 325 + 5000) / 10000 → 393575 ($3935.75); charged $125,035.75
    expect(relayDepositFeeCents(wallet)).toBe(393_575);
    expect(relayDepositChargedCents(wallet)).toBe(12_503_575);
  });
});
