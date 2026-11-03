import { describe, expect, it } from "vitest";
import { classifyWireCandidates, type FaroWireCandidate } from "../faro-1090-wire-proposal.service.js";

function cand(partial: Partial<FaroWireCandidate> & { bank_transaction_id: string }): FaroWireCandidate {
  return {
    transaction_date: "2026-08-15",
    amount_cents: 100_00,
    description: "FARO WIRE",
    merchant_name: "Faro",
    amount_delta_cents: 0,
    day_delta: 0,
    exact_amount: true,
    ...partial,
  };
}

describe("ENG-17 Faro 1090 wire proposal classifier", () => {
  it("NO_EVIDENCE when no candidates", () => {
    expect(classifyWireCandidates([])).toBe("NO_EVIDENCE");
  });

  it("PROPOSED when exactly one exact candidate", () => {
    expect(classifyWireCandidates([cand({ bank_transaction_id: "a" })])).toBe("PROPOSED");
  });

  it("AMBIGUOUS when two exact candidates", () => {
    expect(
      classifyWireCandidates([
        cand({ bank_transaction_id: "a" }),
        cand({ bank_transaction_id: "b", transaction_date: "2026-08-16" }),
      ]),
    ).toBe("AMBIGUOUS");
  });

  it("AMBIGUOUS when one exact sits beside a near candidate", () => {
    expect(
      classifyWireCandidates([
        cand({ bank_transaction_id: "a" }),
        cand({
          bank_transaction_id: "b",
          amount_cents: 100_01,
          amount_delta_cents: 1,
          exact_amount: false,
        }),
      ]),
    ).toBe("AMBIGUOUS");
  });
});
