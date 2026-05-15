/** Tiered categorization hints for banking.bank_transactions review UI (Wave 2 v3). */

export type Confidence = "high" | "medium" | "low";

export type BankingRuleRow = {
  priority: number;
  description_contains: string | null;
  description_regex: string | null;
  amount_min_cents: number | null;
  amount_max_cents: number | null;
  bank_account_filter_id: string | null;
  then_vendor_id: string | null;
  then_account_id: string;
  then_class_id: string | null;
};

export type SuggestionResult = {
  vendor_id: string | null;
  account_id: string;
  class_id: string | null;
  confidence: Confidence;
  source: string;
};

/** Ordered rule evaluation — highest priority wins first matching rule. */
export function suggestionFromRules(
  rules: BankingRuleRow[],
  ctx: {
    description_normalized: string | null;
    amount_cents: number;
    bank_account_id: string;
  }
): SuggestionResult | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const desc = (ctx.description_normalized ?? "").toLowerCase();
  for (const r of sorted) {
    if (r.bank_account_filter_id && r.bank_account_filter_id !== ctx.bank_account_id) continue;
    if (r.amount_min_cents !== null && ctx.amount_cents < r.amount_min_cents) continue;
    if (r.amount_max_cents !== null && ctx.amount_cents > r.amount_max_cents) continue;
    if (r.description_contains) {
      if (!desc.includes(r.description_contains.toLowerCase())) continue;
    }
    if (r.description_regex) {
      try {
        if (!new RegExp(r.description_regex, "i").test(desc)) continue;
      } catch {
        continue;
      }
    }
    return {
      vendor_id: r.then_vendor_id,
      account_id: r.then_account_id,
      class_id: r.then_class_id,
      confidence: "high",
      source: "banking_rule",
    };
  }
  return null;
}

/** Placeholder for Plaid → COA wiring (requires curated mapping table). */
export function suggestionFromPlaidCategory(_primary?: string | null): Omit<SuggestionResult, "vendor_id" | "class_id"> | null {
  return null;
}

export function mergeSuggestionPreferHigher(base: SuggestionResult | null, next: SuggestionResult | null): SuggestionResult | null {
  if (!base) return next;
  if (!next) return base;
  const rank = { high: 3, medium: 2, low: 1 };
  return rank[next.confidence] > rank[base.confidence] ? next : base;
}
