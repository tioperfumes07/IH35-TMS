import { describe, expect, it } from "vitest";
import { mergeSuggestionPreferHigher, suggestionFromRules } from "./suggestion-engine.js";

describe("suggestion engine tiers", () => {
  it("rule tier yields high confidence", () => {
    const rules = [
      {
        priority: 10,
        description_contains: "fuel",
        description_regex: null,
        amount_min_cents: null,
        amount_max_cents: null,
        bank_account_filter_id: null,
        then_vendor_id: null,
        then_account_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        then_class_id: null,
      },
    ];
    const hit = suggestionFromRules(rules, {
      description_normalized: "love's fuel stop #123",
      amount_cents: -5000,
      bank_account_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    expect(hit?.confidence).toBe("high");
    expect(hit?.source).toBe("banking_rule");
  });

  it("mergeSuggestionPreferHigher prefers stronger tier", () => {
    const low = {
      vendor_id: null,
      account_id: "11111111-1111-1111-1111-111111111111",
      class_id: null,
      confidence: "low" as const,
      source: "x",
    };
    const high = {
      vendor_id: null,
      account_id: "22222222-2222-2222-2222-222222222222",
      class_id: null,
      confidence: "high" as const,
      source: "y",
    };
    expect(mergeSuggestionPreferHigher(low, high)).toEqual(high);
  });
});
