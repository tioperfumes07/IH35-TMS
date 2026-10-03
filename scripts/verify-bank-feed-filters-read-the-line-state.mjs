#!/usr/bin/env node
// U26 (owner, 2026-10-03) — "banking filters do not filter correctly". Static pins on the bank feed
// (BankingTransactionsDesignView.tsx); behaviour is proved by bankFeedFilterPredicates.test.ts + the view test.
//   1. the description Combobox is not wired to onSearch={setDescriptionFilter} (closing the box wiped the filter)
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

if (/onSearch=\{setDescriptionFilter\}/.test(src)) fails.push("description filter is wired to onSearch — it clears itself when the box closes");
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
