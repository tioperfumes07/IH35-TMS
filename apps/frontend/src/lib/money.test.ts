import { describe, it, expect } from "vitest";
import {
  formatUsdCents,
  formatUsd,
  formatNumber,
  formatUsdCentsTable,
  formatUsdTable,
  formatNumberTable,
  formatQuantityTable,
  formatUsdRateTable,
  isNegativeMoneyCents,
  TABLE_MISSING,
} from "./money";

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

  it("C-37 table helpers — missing renders em dash, never fabricated zero", () => {
    expect(formatUsdCentsTable(null)).toBe(TABLE_MISSING);
    expect(formatUsdCentsTable(undefined)).toBe(TABLE_MISSING);
    expect(formatUsdTable("")).toBe(TABLE_MISSING);
    expect(formatNumberTable(null)).toBe(TABLE_MISSING);
    expect(formatUsdCentsTable(0)).toBe("$0.00");
  });

  it("C-37 table money uses accounting parentheses for negatives", () => {
    expect(formatUsdCentsTable(-125000)).toBe("($1,250.00)");
    expect(formatUsdCentsTable(-125000)).not.toContain("-$");
    expect(isNegativeMoneyCents(-100)).toBe(true);
    expect(isNegativeMoneyCents(null)).toBe(false);
  });

  it("ROUND 296 5 — unit rates: fixed 4 decimals, accounting parentheses, em dash, never -$0.0000", () => {
    expect(formatUsdRateTable(0.65)).toBe("$0.6500");
    expect(formatUsdRateTable(6.68)).toBe("$6.6800");
    expect(formatUsdRateTable(-0.5)).toBe("($0.5000)");
    expect(formatUsdRateTable(-0.00001)).toBe("$0.0000");
    expect(formatUsdRateTable(null)).toBe(TABLE_MISSING);
  });

  it("ROUND 296 5 — quantities: thousands separators, fixed or floored decimals, em dash", () => {
    expect(formatQuantityTable(1347.2, 1)).toBe("1,347.2");
    expect(formatQuantityTable(115, 3, 1)).toBe("115.0");
    expect(formatQuantityTable(4.725, 3, 1)).toBe("4.725");
    expect(formatQuantityTable(-0, 1)).toBe("0.0");
    expect(formatQuantityTable(undefined)).toBe(TABLE_MISSING);
  });
});
