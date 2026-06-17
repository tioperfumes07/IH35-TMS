import { describe, it, expect } from "vitest";
import { formatMoneyCents } from "./constants";

// Regression: the truck-centric "Awaiting assignment" rows are trucks with NO load, so their
// Linehaul cell has no amount and no currency. Intl.NumberFormat({style:'currency'}) throws on a
// null amount AND on a missing/blank currency — one throw crashed the whole List+Table grid via the
// error boundary. formatMoneyCents must never throw on those inputs.
describe("formatMoneyCents — never crashes the board on no-load rows", () => {
  it("renders an em dash for a missing amount (no rate)", () => {
    expect(formatMoneyCents(null, "USD")).toBe("—");
    expect(formatMoneyCents(undefined, "USD")).toBe("—");
    expect(formatMoneyCents(undefined, undefined)).toBe("—");
  });

  it("does NOT throw when the currency is missing/blank (defaults to USD)", () => {
    expect(() => formatMoneyCents(250000, undefined)).not.toThrow();
    expect(() => formatMoneyCents(250000, "")).not.toThrow();
    expect(() => formatMoneyCents(250000, null)).not.toThrow();
    expect(formatMoneyCents(250000, undefined)).toBe("$2,500.00");
    expect(formatMoneyCents(250000, "")).toBe("$2,500.00");
  });

  it("formats a normal Booked-row rate", () => {
    expect(formatMoneyCents(250000, "USD")).toBe("$2,500.00");
    expect(formatMoneyCents(0, "USD")).toBe("$0.00");
  });
});
