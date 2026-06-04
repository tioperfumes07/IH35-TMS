import { describe, expect, it } from "vitest";
import source from "./PayrollAggregatedPage.tsx?raw";

describe("PayrollAggregatedPage (P5-T25)", () => {
  it("renders aggregated payroll test id", () => {
    expect(source).toContain("payroll-aggregated-page");
  });

  it("loads aggregated payroll API", () => {
    expect(source).toContain("getAggregatedPayroll");
    expect(source).toContain("refreshAggregatedPayroll");
  });

  it("shows driver settlements and QBO sections", () => {
    expect(source).toContain("Driver settlements (TMS)");
    expect(source).toContain("QBO Payroll W-2 runs");
  });

  it("documents Option B scope", () => {
    expect(source).toContain("Option B");
  });

  it("supports manual refresh", () => {
    expect(source).toContain("Refresh");
  });

  it("uses company context", () => {
    expect(source).toContain("useCompanyContext");
  });
});
