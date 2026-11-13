/**
 * BOARD 26 (LEAD ROUND 8.25) — Trial Balance basis + period come from the URL and go back to it.
 * Fail-old (live): /reports/trial-balance?basis=cash opened the Accrual report.
 */
import { describe, expect, it } from "vitest";
import { readTrialBalanceUrlState, writeTrialBalanceUrlState } from "./TrialBalancePage";

const defaults = { start: "2026-10-01", end: "2026-12-31", basis: "accrual" as const };

describe("Trial Balance URL state", () => {
  it("?basis=cash opens Cash", () => {
    expect(readTrialBalanceUrlState(new URLSearchParams("basis=cash"), defaults)).toEqual({ ...defaults, basis: "cash" });
  });
  it("reads a valid from/to period", () => {
    expect(readTrialBalanceUrlState(new URLSearchParams("basis=accrual&from=2026-11-01&to=2026-11-13"), defaults))
      .toEqual({ start: "2026-11-01", end: "2026-11-13", basis: "accrual" });
  });
  it("ignores garbage and inverted ranges", () => {
    expect(readTrialBalanceUrlState(new URLSearchParams("basis=xyz&from=2026-12-01&to=2026-11-01"), defaults)).toEqual(defaults);
  });
  it("writes basis + period and keeps ret", () => {
    const out = writeTrialBalanceUrlState(new URLSearchParams("ret=%2Freports"), { start: "2026-11-01", end: "2026-11-13", basis: "cash" });
    expect(out.get("ret")).toBe("/reports");
    expect([out.get("basis"), out.get("from"), out.get("to")]).toEqual(["cash", "2026-11-01", "2026-11-13"]);
  });
});
