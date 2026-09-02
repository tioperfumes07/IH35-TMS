import { describe, expect, it } from "vitest";
import { computeCompanySettlementNetCents } from "../load-profitability.service.js";

describe("company settlement period P&L", () => {
  it("ties the owner-locked Company Settlement 5753 figures to $2,415.11", () => {
    expect(computeCompanySettlementNetCents({
      revenue_cents: 810_000,
      quick_pay_cents: 7_350,
      driver_pay_cents: 189_795,
      additional_driver_pay_cents: 10_000,
      fuel_cents: 349_192,
      company_expenses_cents: 12_152,
    })).toBe(241_511);
  });
});
