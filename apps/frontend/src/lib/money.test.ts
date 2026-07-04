import { describe, it, expect } from "vitest";
import { formatUsdCents, formatUsd, formatNumber } from "./money";

describe("money (QBO format)", () => {
  it("formats cents with $, thousands commas, and exactly 2 decimals", () => {
    expect(formatUsdCents(400000)).toBe("$4,000.00");
    expect(formatUsdCents(110000)).toBe("$1,100.00");
    expect(formatUsdCents(1234567)).toBe("$12,345.67");
    expect(formatUsdCents(5)).toBe("$0.05");
  });

  it("renders negatives QBO-style with a leading minus", () => {
    expect(formatUsdCents(-125000)).toBe("-$1,250.00");
  });

  it("coerces null/undefined/NaN/string to a safe value", () => {
    expect(formatUsdCents(null)).toBe("$0.00");
    expect(formatUsdCents(undefined)).toBe("$0.00");
    expect(formatUsdCents("250000")).toBe("$2,500.00");
    expect(formatUsdCents(Number.NaN)).toBe("$0.00");
  });

  it("formats dollar amounts", () => {
    expect(formatUsd(4000)).toBe("$4,000.00");
    expect(formatUsd(12.5)).toBe("$12.50");
  });

  it("formats plain numbers with thousands separators and no $", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(1234.56, 1)).toBe("1,234.6");
    expect(formatNumber(null)).toBe("0");
  });
});
