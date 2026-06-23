import { describe, expect, it } from "vitest";
import { formatCentsDisplay, parseToCents } from "./MoneyInput";

// M-1 (P0): the shared QBO-style money seam. The Book Load §A bug was typing 350 (dollars) into a
// *_cents field with NO conversion → stored 350¢ → totalled $3.50. MoneyInput converts dollars↔cents
// at one seam: typed 350 → 35000 cents → displays $350.00. These tests lock the acceptance.
describe("MoneyInput dollars↔cents seam (parseToCents / formatCentsDisplay)", () => {
  it("typing 350 dollars stores 35000 cents (NOT 350)", () => {
    expect(parseToCents("350")).toBe(35000);
  });

  it("typing 1500.5 stores 150050 cents", () => {
    expect(parseToCents("1500.5")).toBe(150050);
  });

  it("strips $ and thousands separators when parsing", () => {
    expect(parseToCents("$1,500.50")).toBe(150050);
  });

  it("empty / partial input parses to null (= $0.00)", () => {
    expect(parseToCents("")).toBeNull();
    expect(parseToCents(".")).toBeNull();
    expect(parseToCents("-")).toBeNull();
  });

  it("displays cents as QBO currency — always 2 decimals + thousands separators", () => {
    expect(formatCentsDisplay(35000)).toBe("350.00");
    expect(formatCentsDisplay(150050)).toBe("1,500.50");
    expect(formatCentsDisplay(0)).toBe("0.00");
  });

  it("round-trips a dollar amount through cents and back", () => {
    const cents = parseToCents("350");
    expect(cents).toBe(35000);
    expect(formatCentsDisplay(cents)).toBe("350.00");
  });
});
