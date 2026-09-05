/**
 * BANK-F02 — pure category/merchant specificity scorer for banking categorization rules.
 *
 * Extracted verbatim from the Plaid sync path so BOTH consumers share ONE implementation:
 *   - integrations/plaid/plaid.service.ts autoCategorize (writes + posts on sync)
 *   - banking/suggestion-engine.ts suggestionFromPlaidCategory (For-Review UI hint, never posts)
 *
 * This module is intentionally dependency-free (no DB, no Plaid SDK, no env) so the review-UI
 * suggestion path and its unit test can reuse the canonical scorer without dragging in the sync
 * service's side effects. Behavior is unchanged; plaid.service re-exports scoreRuleMatch for
 * back-compat with its existing importers.
 */

function normalizeCategoryToken(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[.\s/-]+/g, "_")
    .replace(/[^A-Z0-9_*]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function compileWildcardPattern(pattern: string) {
  const escaped = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * How specifically a rule matched a transaction. 0 = no match; higher wins.
 *
 * THE DEFECT THIS REPLACES. Selection used `rules.find(...)` — FIRST match by priority — while
 * category matching used an unanchored `category.includes(pattern)` over EVERY element of Plaid's
 * hierarchical array. Plaid sends the whole path, e.g. {TRANSPORTATION, TRANSPORTATION_TOLLS}, so a
 * rule with pattern `TRANSPORTATION` matched the PARENT element of every transportation transaction.
 * With that rule seeded at priority 20 and `TOLL` at priority 40, first-match-wins meant the LEAST
 * specific rule always won: 13 Laredo bridge tolls ($1,215.40) posted to Fuel Expense and the correct
 * TOLL rule was never reached.
 *
 * QuickBooks documents the same hazard and the same remedy — rules apply in order and must be arranged
 * most-specific-first, because "a general rule ... will override your smarter, more specific rules."
 * NetSuite likewise matches on memo/payee text, not just a category. Rather than depend on a human
 * keeping 17 priorities in the right order forever, specificity is COMPUTED and the most specific
 * match wins; priority remains the tie-break.
 *
 *   3 = merchant/description match (QuickBooks "Bank text contains" — the most specific signal)
 *   2 = matched the LEAF category (the most specific element Plaid supplied)
 *   1 = matched a PARENT category element
 *
 * The parent tier is deliberately KEPT rather than removed. 21 genuine fuel purchases
 * (FUEL AMERICA TRAVEL, $961.32) are mislabelled TRANSPORTATION_PUBLIC_TRANSIT by Plaid and reach
 * Fuel Expense only through the broad parent rule; deleting that rule to fix tolls would have dropped
 * real expense out of the P&L. Ranking instead of deleting fixes the tolls AND keeps that fuel booked.
 */
export function scoreRuleMatch(
  patternRaw: string | null,
  categories: string[],
  descriptionPatternRaw?: string | null,
  description?: string | null
): number {
  // Tier 3 — merchant text. Checked first: it is the only signal that can correct a WRONG Plaid
  // label (LOVE'S TIRE CARE is a tire purchase Plaid reports as TRANSPORTATION_GAS, which no
  // category rule can ever fix).
  const descPattern = (descriptionPatternRaw ?? "").trim().toUpperCase();
  if (descPattern) {
    const haystack = (description ?? "").toUpperCase();
    if (!haystack) return 0;
    const matched = descPattern.includes("*")
      ? compileWildcardPattern(descPattern.replace(/\s+/g, " ")).test(haystack.replace(/\s+/g, " "))
      : haystack.includes(descPattern);
    if (!matched) return 0;
    return 3;
  }

  const normalizedPattern = normalizeCategoryToken(patternRaw ?? "");
  if (!normalizedPattern) return 0;
  const normalizedCategories = categories.map((category) => normalizeCategoryToken(category)).filter(Boolean);
  if (normalizedCategories.length === 0) return 0;

  // Plaid orders the array general -> specific, so the last element is the leaf.
  const leafIndex = normalizedCategories.length - 1;
  const test = normalizedPattern.includes("*")
    ? (category: string) => compileWildcardPattern(normalizedPattern).test(category)
    : (category: string) => category === normalizedPattern || category.includes(normalizedPattern);

  // A pattern that IS the name of a parent element is a PARENT rule, even though substring matching
  // also makes it "match" the leaf (TRANSPORTATION_TOLLS contains TRANSPORTATION). Without this the
  // parent rule would earn leaf credit and the inversion this function exists to fix would survive
  // inside the scorer itself.
  const isParentRule = normalizedCategories.some(
    (category, i) => i !== leafIndex && category === normalizedPattern
  );

  let best = 0;
  for (let i = 0; i < normalizedCategories.length; i += 1) {
    if (!test(normalizedCategories[i])) continue;
    best = Math.max(best, i === leafIndex && !isParentRule ? 2 : 1);
  }
  return best;
}
