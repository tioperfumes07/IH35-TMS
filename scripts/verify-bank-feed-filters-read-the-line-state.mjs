#!/usr/bin/env node
// U26 (owner, 2026-10-03) — "banking filters do not filter correctly". Static pins on the bank feed
// (BankingTransactionsDesignView.tsx); behaviour is proved by bankFeedFilterPredicates.test.ts + the view test.
//   1. the description Combobox never fires onSearch WITHOUT searchIsValue (closing the box wiped the filter)
//   2. type filters read the line's state machine, not matched_kind / Plaid category text
//   3. tab badges count after every filter (reviewTabBuckets built from passesFilters)
//   4. date presets use the local calendar day (no toISOString().slice(0, 10))
//   5. the KPI pre-filter clears when its prop returns to "all"
import { readFileSync } from "node:fs";

const LABEL = "verify-bank-feed-filters-read-the-line-state";
const F = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const src = readFileSync(F, "utf8");
const fails = [];
const fn = src.slice(src.indexOf("export function matchesTransactionTypeFilter("), src.indexOf("export function BankingTransactionsDesignView("));

// BANK-FILTER-BLUR-01 (Lead, 2026-10-03) — this line used to ban onSearch outright. It pinned U26's
// REMEDY rather than the outcome U26 wanted, and the remedy had a cost: with no onSearch the box
// filters only the rows already loaded, so an operator hunting a merchant that is not on the current
// page cannot find it and can only apply a value that already appears in the list. The real
// requirement is "the typed filter survives the box closing", and that now has a proper mechanism:
// Combobox's `searchIsValue` keeps the query on close instead of firing onSearch(""). So the ban
// becomes conditional — onSearch is allowed when, and only when, searchIsValue rides with it.
// A guard that reads prose reads the wrong thing: the first cut of this check matched the word
// "searchIsValue" anywhere in the file and was satisfied by the COMMENT explaining it, so deleting
// the actual prop still passed. Strip comments, then require the real JSX prop.
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
if (/onSearch=\{setDescriptionFilter\}/.test(code) && !/^\s*searchIsValue(\s*=\s*\{true\})?\s*$/m.test(code))
  fails.push("description filter is wired to onSearch without the searchIsValue prop — it clears itself when the box closes");
if (/case "suggested_matches":\s*return Boolean\(tx\.matched_kind\)/.test(fn)) fails.push("Suggested matches reads matched_kind (lines already matched)");
if (/case "uncategorized":\s*return !tx\.matched_kind/.test(fn)) fails.push("Uncategorized reads matched_kind instead of the For review bucket");
if (/plaid_category/.test(fn)) fails.push("a type filter reads Plaid category text instead of the line's state");
if (!/const forReview = !looksCategorizedTx\(tx\) && !looksExcludedTx\(tx\)/.test(fn)) fails.push("type filters no longer derive For review from the bucket classifier");
if (!/for \(const tx of scopedRows\.filter\(passesFilters\)\)/.test(src)) fails.push("tab badges are counted before the filters run");
if (/toISOString\(\)\.slice\(0, 10\)/.test(src)) fails.push("a date preset formats a UTC date (off by a day in the evening)");
if (!/setSelectedTransactionTypes\(\[\]\);/.test(src)) fails.push("the KPI pre-filter can never clear back to all");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — description filter sticks, type filters read the line state, badges count after filters, local-day presets, pre-filter clears`);
