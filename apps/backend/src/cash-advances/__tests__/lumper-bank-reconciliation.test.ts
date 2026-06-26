import { describe, expect, it } from "vitest";
import {
  type MatchedBankLeg,
  bankMatchRemainderCents,
  validateBankDebitMatch,
} from "../lumper-bank-reconciliation";

describe("lumper-bank-reconciliation — STEP 5 ($400 debit → $250 + $150)", () => {
  const legs400: MatchedBankLeg[] = [
    { kind: "bill_payment", record_id: "bp1", amount_cents: 25000 },
    { kind: "lumper_expense", record_id: "ex1", amount_cents: 15000 },
  ];

  it("accepts the $400 debit matched to $250 bill-payment + $150 lumper expense", () => {
    expect(validateBankDebitMatch(40000, legs400)).toEqual({ ok: true });
    expect(bankMatchRemainderCents(40000, legs400)).toBe(0);
  });

  it("FAILS on an under-match ($250+$150 vs a $500 debit) — no floating remainder allowed", () => {
    const r = validateBankDebitMatch(50000, legs400);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("match_sum_mismatch");
    expect(bankMatchRemainderCents(50000, legs400)).toBe(10000);
  });

  it("FAILS on an over-match ($250+$150 vs a $300 debit)", () => {
    const r = validateBankDebitMatch(30000, legs400);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("match_sum_mismatch");
      expect(r.message).toContain("40000");
      expect(r.message).toContain("30000");
    }
  });

  it("rejects an empty match and non-positive/garbage leg or debit amounts", () => {
    expect(validateBankDebitMatch(40000, []).ok).toBe(false);
    expect(validateBankDebitMatch(40000, [{ kind: "bill_payment", record_id: "x", amount_cents: 0 }]).ok).toBe(false);
    expect(validateBankDebitMatch(0, legs400).ok).toBe(false);
    expect(validateBankDebitMatch(40000, [{ kind: "lumper_expense", record_id: "x", amount_cents: 1.5 }]).ok).toBe(false);
  });

  it("accepts a single-leg match (a non-split advance) when it equals the debit", () => {
    expect(validateBankDebitMatch(40000, [{ kind: "bill_payment", record_id: "bp", amount_cents: 40000 }])).toEqual({ ok: true });
  });
});
