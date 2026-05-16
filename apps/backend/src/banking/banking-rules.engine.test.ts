import { describe, it, expect } from "vitest";
import { bankingRuleMatches, type BankingRuleRow, type BankTxnProbe } from "./banking-rules.engine.js";

describe("banking-rules.engine", () => {
  const txn: BankTxnProbe = {
    description: "ACH PAYROLL IH35 MAY",
    amount_cents: 50000,
    bank_account_id: "bank-a",
  };

  it("matches higher-priority pattern before lower (caller orders DESC)", () => {
    const low: BankingRuleRow = {
      id: "low",
      priority: 1,
      description_contains: "PAYROLL",
      description_regex: null,
      amount_min_cents: null,
      amount_max_cents: null,
      bank_account_filter_id: null,
      then_vendor_id: "00000000-0000-4000-8000-000000000001",
      then_account_id: "00000000-0000-4000-8000-000000000002",
    };
    const high: BankingRuleRow = {
      ...low,
      id: "high",
      priority: 100,
      description_contains: "IH35",
    };
    const ordered = [high, low];
    const first = ordered.find((r) => bankingRuleMatches(r, txn));
    expect(first?.id).toBe("high");
  });

  it("respects bank_account_filter_id", () => {
    const rule: BankingRuleRow = {
      id: "x",
      priority: 10,
      description_contains: null,
      description_regex: null,
      amount_min_cents: null,
      amount_max_cents: null,
      bank_account_filter_id: "other",
      then_vendor_id: null,
      then_account_id: "00000000-0000-4000-8000-000000000002",
    };
    expect(bankingRuleMatches(rule, txn)).toBe(false);
  });
});
