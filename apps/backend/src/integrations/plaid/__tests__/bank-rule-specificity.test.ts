/**
 * BANK-F02 — rule selection must rank by SPECIFICITY, not take the first match by priority.
 *
 * Every case below uses a category array and a description taken verbatim from prod rows
 * (verified 2026-08-03), not invented shapes — the defect was only visible against real Plaid data.
 *
 * THE DEFECT. Selection was `rules.find(...)` (first match by priority) and category matching was an
 * unanchored `includes` over EVERY element of Plaid's hierarchical array. Plaid sends the whole path,
 * so `TRANSPORTATION` matched the parent element of every transportation transaction. Seeded at
 * priority 20 against `TOLL` at 40, the LEAST specific rule always won and 13 Laredo bridge tolls
 * ($1,215.40) posted to Fuel Expense.
 */
import { describe, expect, it } from "vitest";
import { scoreRuleMatch } from "../plaid.service.js";

// Verbatim from prod banking.bank_transactions.plaid_category.
const TOLL = ["TRANSPORTATION", "TRANSPORTATION_TOLLS"];
const GAS = ["TRANSPORTATION", "TRANSPORTATION_GAS"];
const TRANSIT = ["TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT"];

describe("BANK-F02 rule specificity", () => {
  it("a LEAF category match outranks a PARENT category match", () => {
    // This pair is the whole defect: both rules matched, and the parent won on priority.
    const parent = scoreRuleMatch("TRANSPORTATION", TOLL);
    const leaf = scoreRuleMatch("TOLL", TOLL);
    expect(parent).toBeGreaterThan(0); // still matches — the parent rule is not deleted
    expect(leaf).toBeGreaterThan(parent);
  });

  it("a MERCHANT match outranks any category match", () => {
    // LOVE'S TIRE CARE is a tire purchase Plaid labels TRANSPORTATION_GAS (it resolves the merchant
    // brand, not the purchase). No category rule can ever fix that; only bank text can.
    const category = scoreRuleMatch("GAS", GAS);
    const merchant = scoreRuleMatch(null, GAS, "LOVE'S TIRE CARE", "PURCHASE LOVE'S TIRE CARE # TOMS BROOK VA CARD9104");
    expect(category).toBeGreaterThan(0);
    expect(merchant).toBeGreaterThan(category);
  });

  it("a merchant rule does NOT match a different merchant at the same category", () => {
    // Ordinary Love's fuel must keep going to fuel, not to maintenance.
    expect(
      scoreRuleMatch(null, GAS, "LOVE'S TIRE CARE", "PURCHASE AUTHORIZED ON 05/29 LOVE'S #0304 INSID STEELE AL")
    ).toBe(0);
  });

  it("REGRESSION GUARD: genuine fuel mislabelled PUBLIC_TRANSIT still matches the parent rule", () => {
    // 21 FUEL AMERICA TRAVEL rows ($961.32) are real fuel that Plaid labels PUBLIC_TRANSIT. They reach
    // Fuel Expense only through the broad parent rule. Ranking must not silently orphan them — this is
    // why the parent tier is kept rather than removed.
    expect(scoreRuleMatch("TRANSPORTATION", TRANSIT)).toBeGreaterThan(0);
    // and the merchant rule pins the correct outcome explicitly, outranking the parent.
    expect(
      scoreRuleMatch(null, TRANSIT, "FUEL AMERICA", "PURCHASE AUTHORIZED ON 03/03 FUEL AMERICA TRAVE LAREDO TX")
    ).toBeGreaterThan(scoreRuleMatch("TRANSPORTATION", TRANSIT));
  });

  it("no match returns 0 — an unrelated rule never wins by default", () => {
    expect(scoreRuleMatch("INSURANCE", TOLL)).toBe(0);
    expect(scoreRuleMatch(null, TOLL, "COSTCO", "PURCHASE LAREDO BRIDGE SYST TX")).toBe(0);
  });

  it("an empty pattern or empty category list cannot match", () => {
    expect(scoreRuleMatch("", TOLL)).toBe(0);
    expect(scoreRuleMatch("TRANSPORTATION", [])).toBe(0);
    // A merchant rule with no description on the transaction must not match rather than match all.
    expect(scoreRuleMatch(null, GAS, "LOVE'S TIRE CARE", null)).toBe(0);
    expect(scoreRuleMatch(null, GAS, "LOVE'S TIRE CARE", "")).toBe(0);
  });

  it("the concrete prod outcome: the toll rule beats the fuel rule for a Laredo bridge charge", () => {
    // TRANSPORTATION -> Fuel Expense (priority 20) vs TOLL -> Bridge & Toll (priority 40).
    const fuelRule = scoreRuleMatch("TRANSPORTATION", TOLL);
    const tollRule = scoreRuleMatch("TOLL", TOLL);
    const winner = tollRule > fuelRule ? "TOLL" : "TRANSPORTATION";
    expect(winner).toBe("TOLL");
  });
});
