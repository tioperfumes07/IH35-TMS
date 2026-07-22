import { describe, expect, it } from "vitest";
import {
  assertLoadRevenueHasSourceLoad,
  assertRevenueLinesHaveIncomeAccount,
  InvoiceLoadSourceRequiredError,
  InvoiceLineIncomeAccountRequiredError,
  isLoadRevenueLineType,
} from "./invoice-linkage-guards.js";

describe("invoice-linkage-guards (P-INVOICE P0)", () => {
  it("classifies freight line types as load revenue", () => {
    expect(isLoadRevenueLineType("linehaul")).toBe(true);
    expect(isLoadRevenueLineType("accessorial")).toBe(true);
    expect(isLoadRevenueLineType("other")).toBe(false);
    expect(isLoadRevenueLineType("tax")).toBe(false);
  });

  it("fails closed when load revenue has null source_load_id", () => {
    expect(() =>
      assertLoadRevenueHasSourceLoad(null, [
        { line_type: "linehaul", line_total_cents: 10000, account_id: "a" },
      ])
    ).toThrow(InvoiceLoadSourceRequiredError);
  });

  it("allows non-load AR without source_load_id", () => {
    expect(() =>
      assertLoadRevenueHasSourceLoad(null, [
        { line_type: "other", line_total_cents: 5000, account_id: "a" },
      ])
    ).not.toThrow();
  });

  it("fails closed when revenue line has null income account (no invent CoA)", () => {
    expect(() =>
      assertRevenueLinesHaveIncomeAccount("op-1", [
        { id: "line-1", line_type: "linehaul", line_total_cents: 10000, account_id: null },
      ])
    ).toThrow(InvoiceLineIncomeAccountRequiredError);
  });

  it("passes when income account is present", () => {
    expect(() =>
      assertRevenueLinesHaveIncomeAccount("op-1", [
        { id: "line-1", line_type: "linehaul", line_total_cents: 10000, account_id: "acct-1" },
      ])
    ).not.toThrow();
  });
});
