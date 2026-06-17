import { describe, it, expect } from "vitest";
import { toCents, sumCents, computeProjectionTotals } from "./manualProjectionMath";
import type { ForecastEntry } from "../../../api/forecast";

describe("manual projection math — summing-bug regression guard", () => {
  it("sums income as integer cents: $6,500 + $5,500 = $12,000 (never $6,500,005,500)", () => {
    expect(sumCents([{ amount_cents: 650000 }, { amount_cents: 550000 }])).toBe(1200000);
  });

  it("handles bigint-as-string from the API and never string-concatenates", () => {
    expect(sumCents([{ amount_cents: "650000" }, { amount_cents: "550000" }])).toBe(1200000);
    // the exact historical bug value must never reappear
    expect(sumCents([{ amount_cents: "650000" }, { amount_cents: "550000" }])).not.toBe(650000550000);
  });

  it("computes net = income − expense in cents", () => {
    const entries = [
      { direction: "income", amount_cents: "650000" },
      { direction: "income", amount_cents: "550000" },
      { direction: "expense", amount_cents: "200000" },
    ] as unknown as ForecastEntry[];
    const t = computeProjectionTotals(entries);
    expect(t.incomeCents).toBe(1200000);
    expect(t.expenseCents).toBe(200000);
    expect(t.netCents).toBe(1000000);
  });

  it("toCents coerces null/undefined/strings safely", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("12345")).toBe(12345);
    expect(toCents(98765)).toBe(98765);
  });
});
