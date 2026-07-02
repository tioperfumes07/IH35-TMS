import { describe, expect, it } from "vitest";
import { describeCurrentPeriodKpi } from "./finance-hub.service.js";

// FIN-1 regression lock: the Finance Hub "Current accounting period" KPI must never present a
// non-current period as current (the old code returned the most-recent period even when today fell
// in none of them, fabricating an "open" period). Three truthful states only.
describe("FIN-1 finance-hub current-period KPI honesty", () => {
  it("no periods at all → 'No periods initialized' (never a fabricated month)", () => {
    expect(describeCurrentPeriodKpi(null)).toEqual({
      value: "No periods initialized",
      secondary: "No accounting periods defined — set one up",
    });
  });

  it("periods exist but none covers today → 'No open period for today' (does NOT show the stale period as current)", () => {
    const kpi = describeCurrentPeriodKpi({ period_label: "Jan 2024", status: "closed", covers_today: false });
    expect(kpi.value).toBe("No open period for today");
    expect(kpi.value).not.toContain("Jan 2024");
    expect(kpi.secondary).not.toContain("closed");
  });

  it("a period covers today → that period's real label + status", () => {
    expect(describeCurrentPeriodKpi({ period_label: "Jul 2026", status: "open", covers_today: true })).toEqual({
      value: "Jul 2026",
      secondary: "Status: open",
    });
  });

  it("covering period with a null label still never fabricates a month", () => {
    const kpi = describeCurrentPeriodKpi({ period_label: null, status: "open", covers_today: true });
    expect(kpi.value).toBe("Unlabeled period");
  });
});
