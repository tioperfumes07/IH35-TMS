import { describe, it, expect } from "vitest";
import { getCurrentQuarterInfo } from "./shared.js";

// RPT-1 regression: the IFTA "next due" KPI must report the just-ended quarter during its filing month,
// not the current calendar quarter's future deadline. Texas Comptroller: a quarter's return is due the
// last day of the month following quarter end.
const at = (iso: string) => getCurrentQuarterInfo(new Date(`${iso}T12:00:00.000Z`));

describe("getCurrentQuarterInfo — next IFTA return due", () => {
  it("during Q2 filing window (July) reports Q2 due Jul 31, not Q3/Oct 31", () => {
    expect(at("2026-07-01")).toMatchObject({ quarter: "Q2", dueAt: "2026-07-31" });
    expect(at("2026-07-31")).toMatchObject({ quarter: "Q2", dueAt: "2026-07-31" });
  });

  it("after the Q2 deadline (Aug 1) rolls to Q3 due Oct 31", () => {
    expect(at("2026-08-01")).toMatchObject({ quarter: "Q3", dueAt: "2026-10-31" });
  });

  it("Q3 filing window: Oct 31 still Q3, Nov 1 rolls to Q4 due Jan 31 next year", () => {
    expect(at("2026-10-31")).toMatchObject({ quarter: "Q3", dueAt: "2026-10-31" });
    expect(at("2026-11-01")).toMatchObject({ quarter: "Q4", dueAt: "2027-01-31" });
  });

  it("January reports the PRIOR-year Q4 due Jan 31 (not the current year's Q1)", () => {
    expect(at("2026-01-01")).toMatchObject({ quarter: "Q4", dueAt: "2026-01-31" });
    expect(at("2026-01-31")).toMatchObject({ quarter: "Q4", dueAt: "2026-01-31" });
  });

  it("Feb 1 rolls to Q1 due Apr 30", () => {
    expect(at("2026-02-01")).toMatchObject({ quarter: "Q1", dueAt: "2026-04-30" });
  });

  it("daysUntilDue is never negative and counts down within a window", () => {
    expect(at("2026-07-01").daysUntilDue).toBeGreaterThan(at("2026-07-31").daysUntilDue);
    expect(at("2026-07-31").daysUntilDue).toBeGreaterThanOrEqual(0);
  });
});
