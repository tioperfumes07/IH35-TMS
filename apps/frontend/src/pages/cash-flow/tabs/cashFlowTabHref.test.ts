import { describe, expect, it } from "vitest";
import { cashFlowTabHref } from "./cashFlowTabHref";

describe("cashFlowTabHref", () => {
  it("builds daily_prediction tab", () => {
    expect(cashFlowTabHref("daily_prediction")).toBe("/cash-flow?tab=daily_prediction");
  });

  it("includes rolling ledger provenance", () => {
    const href = cashFlowTabHref("rolling_ledger", {
      rl_from: "2026-11-01",
      rl_to: "2026-11-14",
      rl_kind: "income",
      rl_types: "Invoice,Factor advance",
    });
    expect(href).toContain("tab=rolling_ledger");
    expect(href).toContain("rl_from=2026-11-01");
    expect(href).toContain("rl_to=2026-11-14");
    expect(href).toContain("rl_kind=income");
    expect(href).toContain("rl_types=Invoice%2CFactor+advance");
  });
});
