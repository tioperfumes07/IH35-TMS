import { describe, expect, it } from "vitest";
import { resolveCashFlowBucket } from "../cash-flow.service.js";

describe("resolveCashFlowBucket — Faro recourse is secured borrowing", () => {
  it("puts Faro advances (2150 / factoring_advance) in FINANCING, never operating", () => {
    expect(
      resolveCashFlowBucket({
        account_type: "Liability",
        account_subtype: "OtherCurrentLiability",
        account_number: "2150",
        system_purpose: "factoring_advance_liability",
        source_transaction_type: "factoring_advance",
      }).bucket,
    ).toBe("financing");
    expect(
      resolveCashFlowBucket({
        account_type: "Liability",
        account_subtype: "OtherCurrentLiability",
        source_transaction_type: "factoring_advance",
      }).bucket,
    ).toBe("financing");
  });

  it("never sends the 1.5% reserve (1200/1230/1235) to INVESTING", () => {
    for (const account_number of ["1200", "1230", "1235"]) {
      const resolved = resolveCashFlowBucket({
        account_type: "Asset",
        account_subtype: "OtherCurrentAsset",
        account_number,
        source_transaction_type: "factoring_reserve_release",
      });
      expect(resolved.bucket).toBe("operating");
      expect(resolved.bucket).not.toBe("investing");
    }
  });

  it("keeps customer collections OPERATING", () => {
    expect(
      resolveCashFlowBucket({
        account_type: "Asset",
        account_subtype: "AccountsReceivable",
        source_transaction_type: "factoring_customer_payment",
      }).bucket,
    ).toBe("operating");
    expect(
      resolveCashFlowBucket({
        account_type: "Asset",
        account_subtype: "AccountsReceivable",
        source_transaction_type: "customer_payment",
      }).bucket,
    ).toBe("operating");
  });
});
