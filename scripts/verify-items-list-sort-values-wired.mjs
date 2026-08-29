#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["items","connectivity"],"leaves":["lists.accounting.items.sort_wired"],"task":"LISTS-ITEMS-CATALOG-SORT-NO-OP","vertical":"column-wave"} */
/**
 * LISTS-ITEMS-CATALOG-SORT-NO-OP (GO-0027 drain, CC-1, 2026-08-28): `/lists/accounting/items`
 * (Products & Services) marked 5 of its 6 ParityTable columns `sortable: true` — Type/Sides,
 * Category, Income account, Expense account, Status — with no `sortValue`. None of those keys
 * ("type"/"category"/"income"/"expense"/"status") are real fields on AccountingCatalogRow (the
 * real data sits inside `metadata` or requires an id→name lookup), so ParityTable's default
 * `row[key]` sort fallback was always `undefined` and clicking those headers was a visual no-op.
 * Root-caused live: apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx's `columns` array.
 * Fixed by wiring each column's own existing render-value function (`itemSummary`,
 * `resolveCategory`, `resolveAccount`, `is_active`) as its `sortValue` too. This guard holds that
 * fix so it cannot regress.
 *
 * Self-test: node scripts/verify-items-list-sort-values-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  page: "apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx",
};
const LABEL = "verify-items-list-sort-values-wired";

const REQUIRED = [
  { key: "type", pattern: /key:\s*"type"[\s\S]{0,200}?sortValue:\s*\(r\)\s*=>\s*itemSummary\(r\)/ },
  { key: "category", pattern: /key:\s*"category"[\s\S]{0,200}?sortValue:\s*\(r\)\s*=>\s*resolveCategory\(r\)/ },
  { key: "income", pattern: /key:\s*"income"[\s\S]{0,250}?sortValue:\s*\(r\)\s*=>\s*resolveAccount\(r\.metadata\.default_income_account_id\)/ },
  { key: "expense", pattern: /key:\s*"expense"[\s\S]{0,250}?sortValue:\s*\(r\)\s*=>\s*resolveAccount\(r\.metadata\.default_expense_account_id\)/ },
  { key: "status", pattern: /key:\s*"status"[\s\S]{0,200}?sortValue:\s*\(r\)\s*=>\s*\(r\.is_active \? 1 : 0\)/ },
];

export function audit(src) {
  const failures = [];
  const columnsMatch = src.page.match(/const columns: Array<ParityColumn<AccountingCatalogRow>> = \[[\s\S]*?\n  \];/);
  if (!columnsMatch) {
    failures.push(`${FILES.page}: ItemsListPage columns array not found`);
    return failures;
  }
  const body = columnsMatch[0];
  for (const { key, pattern } of REQUIRED) {
    if (!pattern.test(body)) {
      failures.push(
        `${FILES.page}: column "${key}" must carry a sortValue extractor matching its own render ` +
          `value, or clicking that header sorts nothing (row[key] is always undefined for derived columns)`,
      );
    }
  }
  return failures;
}

function loadSrc(root) {
  return {
    page: fs.readFileSync(path.join(root, FILES.page), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let mutationsDetected = 0;
  for (const { key } of REQUIRED) {
    const re = new RegExp(`key: "${key}", label: "[^"]*", sortable: true, sortValue: \\(r\\) => [^,]+, render:`);
    const mutated = { page: good.page.replace(re, (m) => m.replace(/sortValue: \(r\) => [^,]+, /, "")) };
    if (mutated.page === good.page) {
      // status has a different literal shape (multi-line); handle separately below
      continue;
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — removing "${key}"'s sortValue escaped detection`);
      process.exit(1);
    }
    mutationsDetected += 1;
  }
  const statusMutated = {
    page: good.page.replace('      sortValue: (r) => (r.is_active ? 1 : 0),\n', ""),
  };
  if (statusMutated.page === good.page) {
    console.error(`${LABEL} SELFTEST FAIL — status sortValue removal pattern did not match, re-anchor`);
    process.exit(1);
  }
  if (audit(statusMutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — removing "status"'s sortValue escaped detection`);
    process.exit(1);
  }
  mutationsDetected += 1;
  if (mutationsDetected < REQUIRED.length) {
    console.error(`${LABEL} SELFTEST FAIL — only ${mutationsDetected}/${REQUIRED.length} mutations matched source, re-anchor`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationsDetected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 5 derived Items-list columns carry a matching sortValue`);
