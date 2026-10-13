import { describe, expect, it } from "vitest";
import source from "./PayrollAggregatedPage.tsx?raw";

describe("PayrollAggregatedPage (P5-T25)", () => {
  it("renders aggregated payroll test id", () => {
    expect(source).toContain("payroll-aggregated-page");
  });

  it("loads aggregated payroll API", () => {
    expect(source).toContain("getAggregatedPayroll");
  });

  it("shows driver settlements only — no QBO payroll section (ACCT-F4431379)", () => {
    expect(source).toContain("Driver settlements (TMS)");
    expect(source).not.toContain("qbo_w2_runs");
    expect(source).not.toContain("refreshAggregatedPayroll");
  });

  it("documents Option B scope", () => {
    expect(source).toContain("Option B");
  });

  it("uses company context", () => {
    expect(source).toContain("useCompanyContext");
  });
});
