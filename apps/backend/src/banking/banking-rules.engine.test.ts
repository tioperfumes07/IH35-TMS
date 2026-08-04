import { describe, it, expect } from "vitest";
import {
  bankingRuleMatches,
  normalizePayeeText,
  type BankingRuleRow,
  type BankTxnProbe,
} from "./banking-rules.engine.js";

describe("banking-rules.engine", () => {
  const txn: BankTxnProbe = {
    description: "ACH PAYROLL IH35 MAY",
    merchant_name: null,
    amount_cents: 50000,
    bank_account_id: "bank-a",
  };

  const baseRule = (): BankingRuleRow => ({
    id: "low",
    priority: 1,
    description_contains: "PAYROLL",
    description_regex: null,
    merchant_contains: null,
    amount_min_cents: null,
    amount_max_cents: null,
    bank_account_filter_id: null,
    then_vendor_id: "00000000-0000-4000-8000-000000000001",
    then_account_id: "00000000-0000-4000-8000-000000000002",
  });

  it("matches higher-priority pattern before lower (caller orders DESC)", () => {
    const low = baseRule();
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
      ...baseRule(),
      bank_account_filter_id: "other",
    };
    expect(bankingRuleMatches(rule, txn)).toBe(false);
  });

  it("does not match when no text condition is set (even if amount fits)", () => {
    const rule: BankingRuleRow = {
      ...baseRule(),
      description_contains: null,
      description_regex: null,
      merchant_contains: null,
    };
    expect(bankingRuleMatches(rule, txn)).toBe(false);
  });

  it("matches merchant_contains against merchant_name OR description (apostrophe-normalized)", () => {
    const rule: BankingRuleRow = {
      ...baseRule(),
      description_contains: null,
      merchant_contains: "LOVE'S TIRE CARE",
      then_account_id: "27c4a09a-0d34-4908-9da1-44b6174b5bce",
    };
    expect(
      bankingRuleMatches(rule, {
        description: "POS LOVES TIRE CARE #123",
        merchant_name: null,
        amount_cents: 10000,
        bank_account_id: "bank-a",
      })
    ).toBe(true);
    expect(
      bankingRuleMatches(rule, {
        description: "OTHER",
        merchant_name: "LOVE'S TIRE CARE",
        amount_cents: 10000,
        bank_account_id: "bank-a",
      })
    ).toBe(true);
    expect(normalizePayeeText("LOVE'S")).toBe("loves");
  });

  it("matches FUEL AMERICA merchant rule", () => {
    const rule: BankingRuleRow = {
      ...baseRule(),
      description_contains: null,
      merchant_contains: "FUEL AMERICA",
      then_account_id: "58c6e304-ab3e-4714-9c35-623ec51ae7cf",
    };
    expect(
      bankingRuleMatches(rule, {
        description: "DEBIT CARD FUEL AMERICA AUSTIN",
        merchant_name: "FUEL AMERICA",
        amount_cents: 4500,
        bank_account_id: "bank-a",
      })
    ).toBe(true);
  });
});
