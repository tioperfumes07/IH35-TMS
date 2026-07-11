#!/usr/bin/env node
// Block 5 (COA-ACCT-DETAIL-01) — Chart of Accounts creator: Account Type → Detail Type cascade lock.
//
// The New/Edit Account drawer groups the Account Type picker by statement (QBO parity) and cascades a
// dependent Detail Type dropdown off it. That cascade had a real regression once — the Detail Type list
// was ALWAYS empty because the 8-value COA group enum never matched the 15-code account-types catalog;
// the fix was the COA_ENUM_TO_CATALOG_CODES map. This guard locks the whole contract so it can't rot:
//   - every account_type enum maps to at least one catalog code (no enum → empty Detail Type list);
//   - the Account Type select is grouped into Balance Sheet / Profit & Loss <optgroup>s (QBO parity);
//   - the Detail Type select is driven by the cascaded detailTypesForType list;
//   - changing the Account Type resets the Detail Type (no stale cross-type subtype).
// Non-financial UI contract guard — pairs with verify:accounting-catalog-creator / :detail-type-catalog.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-coa-account-detail-type-cascade";
// COA_ENUM_TO_CATALOG_CODES was extracted to the shared api/coa-list.ts (single source of truth, anti-drift)
// and is imported by both AccountDrawer and the QuickCreate category creator. Read BOTH so the contract is
// found wherever it lives (the map moving files must not break this guard).
const FILES = [
  "apps/frontend/src/api/coa-list.ts",
  "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
];
const src = FILES.map((f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "")).join("\n");
const failures = [];

const ENUMS = ["Asset", "Liability", "Equity", "Income", "Expense", "CostOfGoodsSold", "OtherIncome", "OtherExpense"];

if (!src) {
  failures.push(`missing ${FILE}`);
} else {
  // 1. Every COA group enum must map to ≥1 catalog code (else its Detail Type dropdown is empty).
  // Anchor on the const DECLARATION (not a comment/type mention) so the map body is captured, wherever it lives.
  const mapMatch = src.match(/const\s+COA_ENUM_TO_CATALOG_CODES[^{]*\{([\s\S]*?)\}/);
  if (!mapMatch) {
    failures.push("COA_ENUM_TO_CATALOG_CODES map missing (Detail Type cascade would be empty)");
  } else {
    const mapBody = mapMatch[1];
    for (const e of ENUMS) {
      const re = new RegExp(`${e}\\s*:\\s*\\[\\s*["']`);
      if (!re.test(mapBody)) failures.push(`account_type "${e}" has no catalog code(s) in COA_ENUM_TO_CATALOG_CODES`);
    }
  }

  // 2. Account Type picker grouped by statement (QBO parity).
  if (!/ACCOUNT_TYPE_GROUPS/.test(src)) failures.push("Account Type picker must be statement-grouped (ACCOUNT_TYPE_GROUPS)");
  if (!/<optgroup/.test(src)) failures.push("Account Type picker must render <optgroup>s");
  if (!/Balance Sheet/.test(src) || !/Profit & Loss/.test(src)) failures.push("Account Type groups must be Balance Sheet + Profit & Loss");

  // 3. Detail Type select cascades off the account-type-derived list.
  if (!/detailTypesForType/.test(src)) failures.push("Detail Type select must cascade off detailTypesForType");
  if (!/detailTypesForType\.map/.test(src)) failures.push("Detail Type <option>s must render from detailTypesForType");

  // 4. Changing Account Type resets the Detail Type (no stale cross-type subtype).
  const onChangeIdx = src.indexOf('setField("account_type"');
  const onChangeBlock = onChangeIdx >= 0 ? src.slice(onChangeIdx, onChangeIdx + 240) : "";
  if (!/setField\("account_subtype", ""\)/.test(onChangeBlock)) {
    failures.push("changing Account Type must reset account_subtype (Detail Type)");
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (8 enums mapped, statement-grouped picker, cascaded Detail Type, reset-on-type-change)`);
