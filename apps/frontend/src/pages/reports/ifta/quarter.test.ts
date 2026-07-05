import { describe, expect, it } from "vitest";
import { filingQuarter, filingQuarterLabel, parseQuarterLabel, recentQuarterOptions } from "./quarter";

describe("IFTA filing quarter (COMP-1 regression)", () => {
  it("a Q1 filing prepared in April targets Q1, not Q2", () => {
    // April 15, 2026 is calendar Q2, but the quarter being FILED (due Apr 30) is Q1.
    const april = new Date(Date.UTC(2026, 3, 15));
    expect(filingQuarter(april)).toEqual({ quarter: 1, year: 2026 });
    expect(filingQuarterLabel(april)).toBe("2026-Q1");
  });

  it("filing in January targets the prior year's Q4", () => {
    const january = new Date(Date.UTC(2026, 0, 10));
    expect(filingQuarter(january)).toEqual({ quarter: 4, year: 2025 });
  });

  it("filing in July targets Q2, in October targets Q3", () => {
    expect(filingQuarter(new Date(Date.UTC(2026, 6, 5)))).toEqual({ quarter: 2, year: 2026 });
    expect(filingQuarter(new Date(Date.UTC(2026, 9, 5)))).toEqual({ quarter: 3, year: 2026 });
  });

  it("recentQuarterOptions lists the filing quarter first, walking back across a year boundary", () => {
    const opts = recentQuarterOptions(3, new Date(Date.UTC(2026, 3, 15)));
    expect(opts).toEqual([
      { quarter: 1, year: 2026 },
      { quarter: 4, year: 2025 },
      { quarter: 3, year: 2025 },
    ]);
  });

  it("parseQuarterLabel round-trips", () => {
    expect(parseQuarterLabel("2025-Q3")).toEqual({ quarter: 3, year: 2025 });
  });
});
