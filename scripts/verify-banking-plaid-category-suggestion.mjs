#!/usr/bin/env node
// BANK-F25011 GUARD — Plaid-category suggestion reuses the canonical BANK-F02 scorer.
//
// Owner: the bank-feed For-Review UI must SUGGEST a GL account for uncategorized transactions from the
// owner-curated banking.transaction_categories mapping — it was a hard-coded `return null` placeholder,
// so every Plaid-category row surfaced no hint and the operator categorized 400+ rows blind. This guard
// locks the fix so it can't silently regress to the placeholder:
//   1. a dependency-free shared scorer module exists and exports scoreRuleMatch
//   2. plaid.service re-exports scoreRuleMatch (back-compat for its importers/test) and no longer
//      DEFINES it inline (single source of truth — no drift between sync and review paths)
//   3. suggestion-engine.suggestionFromPlaidCategory reuses scoreRuleMatch (not `return null`) and
//      emits the plaid_category source with account_id + tiered confidence
//   4. the review route loads banking.transaction_categories and passes the full category path
// Suggestion-only: this guard also asserts the function contract stays a hint (no GL write here).
import { readFileSync } from "node:fs";

const SCORING = "apps/backend/src/banking/category-scoring.ts";
const PLAID = "apps/backend/src/integrations/plaid/plaid.service.ts";
const ENGINE = "apps/backend/src/banking/suggestion-engine.ts";
const ROUTES = "apps/backend/src/banking/p7-wave2.routes.ts";

const fail = (m) => {
  console.error(`FAIL verify-banking-plaid-category-suggestion: ${m}`);
  process.exit(1);
};

function verify(files) {
  const failures = [];
  const scoring = files[SCORING];
  const plaid = files[PLAID];
  const engine = files[ENGINE];
  const routes = files[ROUTES];

  // 1 — shared pure scorer module exports scoreRuleMatch
  if (!/export function scoreRuleMatch\(/.test(scoring)) failures.push("scoring-module-export");

  // 2 — plaid.service re-exports and no longer defines scoreRuleMatch inline
  if (!/export \{ scoreRuleMatch \}/.test(plaid)) failures.push("plaid-reexport");
  if (/export function scoreRuleMatch\(/.test(plaid)) failures.push("plaid-still-defines-inline");
  if (!/from ["'][^"']*banking\/category-scoring\.js["']/.test(plaid)) failures.push("plaid-imports-scoring");

  // 3 — suggestion engine reuses the scorer, is not the null placeholder, emits plaid_category
  if (!/from ["']\.\/category-scoring\.js["']/.test(engine)) failures.push("engine-imports-scoring");
  if (/export function suggestionFromPlaidCategory\([^)]*\)[^{]*\{\s*return null;\s*\}/.test(engine))
    failures.push("engine-still-placeholder");
  if (!/scoreRuleMatch\(/.test(engine)) failures.push("engine-uses-scorer");
  if (!/source:\s*"plaid_category"/.test(engine)) failures.push("engine-source-tag");

  // 4 — review route loads the curated mapping and passes the full category path (not [0])
  if (!/FROM banking\.transaction_categories/.test(routes)) failures.push("route-loads-categories");
  if (!/suggestionFromPlaidCategory\(\s*categoryRules/.test(routes)) failures.push("route-passes-rules");

  return failures;
}

function load() {
  return {
    [SCORING]: readFileSync(SCORING, "utf8"),
    [PLAID]: readFileSync(PLAID, "utf8"),
    [ENGINE]: readFileSync(ENGINE, "utf8"),
    [ROUTES]: readFileSync(ROUTES, "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const files = load();
  const baseline = verify(files);
  if (baseline.length) fail(`baseline is not green — real checks failing: ${baseline.join(", ")}`);
  const mutations = [
    { ...files, [SCORING]: files[SCORING].replace("export function scoreRuleMatch(", "function scoreRuleMatch(") },
    { ...files, [PLAID]: files[PLAID].replace("export { scoreRuleMatch }", "// removed") },
    { ...files, [ENGINE]: files[ENGINE].replace(/source:\s*"plaid_category"/, 'source: "NOPE"') },
    {
      ...files,
      [ENGINE]: files[ENGINE].replace(/scoreRuleMatch\(/g, "noScore("),
    },
    { ...files, [ROUTES]: files[ROUTES].replace("FROM banking.transaction_categories", "FROM banking.NOPE") },
    { ...files, [ROUTES]: files[ROUTES].replace("suggestionFromPlaidCategory(\n          categoryRules", "suggestionFromPlaidCategory(\n          null") },
  ];
  for (const m of mutations) {
    if (JSON.stringify(m) === JSON.stringify(files)) fail("a selftest mutation did not change any source — the check is stale");
    if (verify(m).length === 0) fail("a mutation still passed — a check is too weak");
  }
  console.log(`OK verify-banking-plaid-category-suggestion --selftest: baseline green, ${mutations.length} mutations all caught.`);
  process.exit(0);
}

const failures = verify(load());
if (failures.length) fail(`Plaid-category suggestion wiring missing/regressed: ${failures.join(", ")}`);
console.log("OK verify-banking-plaid-category-suggestion: suggestionFromPlaidCategory reuses the shared scoreRuleMatch against banking.transaction_categories (suggestion only).");
