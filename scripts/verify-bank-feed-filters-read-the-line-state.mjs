#!/usr/bin/env node
// U26 (owner, 2026-10-03) — "banking filters do not filter correctly". Static pins on the bank feed
// (BankingTransactionsDesignView.tsx); behaviour is proved by bankFeedFilterPredicates.test.ts + the view test.
//   1. the description Combobox never fires onSearch WITHOUT searchIsValue (closing the box wiped the filter)
//   2. type filters read the line's state machine, not matched_kind / Plaid category text
//   3. tab badges count after every filter (reviewTabBuckets built from passesFilters)
//   4. date presets use the local calendar day (no toISOString().slice(0, 10))
//   5. the KPI pre-filter clears when its prop returns to "all"
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";


if (process.argv.includes("--selftest")) selftest();

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

// BANK-FEED-ALL-BULK-UNDO (owner 2026-10-08) — All review tab is gone; bulk categorize is
// vendor + Category|Product/Service; Categorized action caret portals Undo (not clipped).
const reviewTabsBlock = (src.match(/export const BANKING_REVIEW_TABS = \[[\s\S]*?\] as const/) ?? [""])[0];
if (/\{\s*id:\s*"all"\s*,\s*label:/.test(reviewTabsBlock))
  fails.push("BANKING_REVIEW_TABS still includes an All review tab — owner removed it (confusing)");
if (!/id:\s*"for_review"/.test(reviewTabsBlock) || !/id:\s*"categorized"/.test(reviewTabsBlock) || !/id:\s*"excluded"/.test(reviewTabsBlock))
  fails.push("BANKING_REVIEW_TABS must keep For review / Categorized / Excluded");
if (!/data-testid="banking-bulk-categorize-modal"/.test(src))
  fails.push("bulk categorize modal missing (For review multi-select → QBO categorize)");
if (!/data-testid="banking-bulk-categorize-vendor"/.test(src))
  fails.push("bulk categorize must require one vendor (payee) for all selected");
if (!/data-testid=\{`banking-bulk-categorize-by-\$\{option\}`\}/.test(src) || !/\(\["category", "item"\] as const\)/.test(src))
  fails.push("bulk categorize must offer Category OR Product/Service");
if (!/vendor_id:\s*bulkCategorizeVendorId/.test(src))
  fails.push("bulk categorize must send vendor_id to categorize-bulk");
if (!/createPortal\(/.test(src) || !/data-testid=\{`banking-action-menu-undo-\$\{tx\.id\}`\}/.test(src))
  fails.push("Categorized action ▾ must portal Undo (overflowVisible + createPortal)");
if (!/overflowVisible:\s*true/.test(src))
  fails.push("Action column must set overflowVisible so the caret menu is not clipped");

const bulkBe = readFileSync("apps/backend/src/banking/categorization.routes.ts", "utf8");
const bulkSchema = (bulkBe.match(/const bulkCategorizeBodySchema = z[\s\S]*?\.refine\([\s\S]*?\}\);/) ?? [""])[0];
if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(bulkSchema))
  fails.push("categorize-bulk schema must accept vendor_id");
if (!/item_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(bulkSchema))
  fails.push("categorize-bulk schema must accept item_id");
if (!/gl_account_id_or_item_id_required/.test(bulkSchema))
  fails.push("categorize-bulk must require gl_account_id OR item_id");
if (!/categorization_vendor_id = COALESCE\(\$6, categorization_vendor_id\)/.test(bulkBe))
  fails.push("categorize-bulk UPDATE must write categorization_vendor_id");
if (!/categorization_item_id = COALESCE\(\$7, categorization_item_id\)/.test(bulkBe))
  fails.push("categorize-bulk UPDATE must write categorization_item_id");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — description filter sticks, type filters read the line state, badges count after filters, local-day presets, pre-filter clears, no All tab, bulk vendor+cat/item, Undo portal`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-bank-feed-filters-read-the-line-state", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
