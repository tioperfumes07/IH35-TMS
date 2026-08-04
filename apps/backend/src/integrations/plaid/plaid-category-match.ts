/**
 * Plaid transaction_categories specificity — leaf beats parent.
 * Exact token > longer pattern > non-parent > priority ASC (lower wins).
 */

/** Broad Plaid parents that must not steal a more-specific leaf match. */
export const PLAID_PARENT_CATEGORY_TOKENS = new Set([
  "TRANSPORTATION",
  "OTHER",
  "GENERAL_MERCHANDISE",
  "GENERAL_SERVICES",
  "BUSINESS_SERVICES",
  "FINANCIAL",
  "TRAVEL",
  "FOOD_AND_DRINK",
  "SHOPS",
  "SERVICE",
  "PAYMENT",
  "TRANSFER",
]);

export function normalizeCategoryToken(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[.\s/-]+/g, "_")
    .replace(/[^A-Z0-9_*]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function compileWildcardPattern(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

export type CategoryMatchDetail = {
  matches: boolean;
  exact: boolean;
  patternLen: number;
  isParent: boolean;
  normalizedPattern: string;
};

/** Detail for one rule pattern vs Plaid category tokens (empty = no match). */
export function matchCategoryRuleDetail(
  patternRaw: string,
  categories: string[]
): CategoryMatchDetail | null {
  const normalizedPattern = normalizeCategoryToken(patternRaw);
  if (!normalizedPattern) return null;
  const normalizedCategories = categories.map((c) => normalizeCategoryToken(c)).filter(Boolean);
  if (normalizedCategories.length === 0) return null;

  let exact = false;
  let matches = false;

  if (normalizedPattern.includes("*")) {
    const matcher = compileWildcardPattern(normalizedPattern);
    matches = normalizedCategories.some((category) => matcher.test(category));
    exact = matches && normalizedCategories.some((category) => category === normalizedPattern.replace(/\*/g, ""));
  } else {
    exact = normalizedCategories.some((category) => category === normalizedPattern);
    // Substring: category contains pattern (leaf tokens inside detailed Plaid paths).
    // Exact beats substring in pickBestCategoryRule.
    matches =
      exact || normalizedCategories.some((category) => category.includes(normalizedPattern));
  }

  if (!matches) return null;

  return {
    matches: true,
    exact,
    patternLen: normalizedPattern.replace(/\*/g, "").length,
    isParent: PLAID_PARENT_CATEGORY_TOKENS.has(normalizedPattern),
    normalizedPattern,
  };
}

export function matchesRule(patternRaw: string, categories: string[]): boolean {
  return matchCategoryRuleDetail(patternRaw, categories) != null;
}

export type CategoryRulePick = {
  plaid_category_pattern: string;
  coa_account_id: string | null;
  priority: number;
  id?: string;
};

/**
 * Among matching Plaid category rules, prefer leaf over parent.
 * Tie-break: exact > longer pattern > non-parent > priority ASC > stable id.
 */
export function pickBestCategoryRule<T extends CategoryRulePick>(
  rules: T[],
  categories: string[]
): T | null {
  type Scored = { rule: T; exact: boolean; patternLen: number; isParent: boolean; priority: number };
  const scored: Scored[] = [];
  for (const rule of rules) {
    if (!rule.coa_account_id) continue;
    const detail = matchCategoryRuleDetail(rule.plaid_category_pattern, categories);
    if (!detail) continue;
    scored.push({
      rule,
      exact: detail.exact,
      patternLen: detail.patternLen,
      isParent: detail.isParent,
      priority: rule.priority,
    });
  }
  if (scored.length === 0) return null;

  // If any non-parent (leaf) matched, drop parent catch-alls — leaf always beats parent.
  const leaves = scored.filter((s) => !s.isParent);
  const pool = leaves.length > 0 ? leaves : scored;

  pool.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.patternLen !== b.patternLen) return b.patternLen - a.patternLen;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return String(a.rule.id ?? a.rule.plaid_category_pattern).localeCompare(
      String(b.rule.id ?? b.rule.plaid_category_pattern)
    );
  });

  return pool[0]!.rule;
}
