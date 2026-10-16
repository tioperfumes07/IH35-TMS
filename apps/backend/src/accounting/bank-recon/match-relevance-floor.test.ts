/**
 * LEAD 443.158 M1c — owner case, measured live 2026-10-16: BofA 12/16/2025 money-out $750.00 "Zelle payment to LAW OFFICES
 * OF ELISAMAR SOTO …" was offered EXP-2025-00001 (Angel Olvera, $2,000.00): gap $1,250.00, memo similarity 0.36, payee
 * similarity 0. No Elisamar Soto document exists, so the default search must offer nothing. Fails on the old engine
 * (no relevance floor: passesMatchRelevanceFloor does not exist).
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_MATCH_MEMO_SIMILARITY_MIN,
  passesMatchRelevanceFloor,
  payeeSimilarity,
  toleranceForAmountCents,
} from "./match.service.js";

const LINE = 'Zelle payment to LAW OFFICES OF ELISAMAR SOTO for "Appeal-Jo';

describe("bank match relevance floor (443.158 M1c)", () => {
  it("the owner's $750 Elisamar Soto line is NOT offered the $2,000 Angel Olvera expense", () => {
    const tolerance = toleranceForAmountCents(75000);
    expect(tolerance).toBe(100);
    expect(payeeSimilarity(LINE, "Angel Olvera")).toBe(0);
    expect(passesMatchRelevanceFloor({ amountGapCents: 125000, similarity: 0.36, toleranceCents: tolerance })).toBe(false);
  });
  it("an exact or in-tolerance amount is offered even with no similarity", () => {
    expect(passesMatchRelevanceFloor({ amountGapCents: 0, similarity: 0, toleranceCents: 100 })).toBe(true);
    expect(passesMatchRelevanceFloor({ amountGapCents: 100, similarity: 0, toleranceCents: 100 })).toBe(true);
  });
  it("a document that resembles the line is offered at any amount (similarity >= the calibrated 0.5)", () => {
    expect(AUTO_MATCH_MEMO_SIMILARITY_MIN).toBe(0.5);
    expect(passesMatchRelevanceFloor({ amountGapCents: 125000, similarity: 0.5, toleranceCents: 100 })).toBe(true);
  });
});
