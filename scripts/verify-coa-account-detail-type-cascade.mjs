#!/usr/bin/env node
/**
 * Block 5 (COA-ACCT-DETAIL-01) — Chart of Accounts creator: Account Type → Detail Type cascade lock.
 *
 * QBO parity (owner 2026-07-23): Account Type picker uses the LIVE catalogs.account_types catalog
 * (BANK, EXP, AR, …) grouped by Balance Sheet / Profit & Loss. Detail Type cascades from ONE
 * catalog code via detailTypesForCatalogCode — never merges every Asset/Expense subtype under the
 * 8-value GL enum (that was the "all detail types under Expense" bug).
 *
 * Also locks: Make inactive label, optional account number (no slug invent), subtype reset on type change.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-coa-account-detail-type-cascade";
const FILES = [
  "apps/frontend/src/api/coa-list.ts",
  "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx",
  "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx",
];
const src = FILES.map((f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "")).join(
  "\n",
);
const failures = [];

const ENUMS = ["Asset", "Liability", "Equity", "Income", "Expense", "CostOfGoodsSold", "OtherIncome", "OtherExpense"];

if (!src) {
  failures.push("missing AccountDrawer / coa-list sources");
} else {
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

  if (!/CATALOG_CODE_TO_COA_ENUM/.test(src)) {
    failures.push("CATALOG_CODE_TO_COA_ENUM required (QBO catalog code → 8-value enum)");
  }
  if (!/detailTypesForCatalogCode/.test(src)) {
    failures.push("detailTypesForCatalogCode required (one catalog code → its detail types only)");
  }
  if (!/accountTypePickerGroups/.test(src) && !/ACCOUNT_TYPE_GROUPS/.test(src)) {
    failures.push("Account Type picker must be statement-grouped (accountTypePickerGroups)");
  }
  if (!/<optgroup/.test(src)) failures.push("Account Type picker must render <optgroup>s");
  if (!/Balance Sheet/.test(src) || !/Profit & Loss/.test(src)) {
    failures.push("Account Type groups must be Balance Sheet + Profit & Loss");
  }
  if (!/catalog_type_code|catalogTypeCode/.test(src)) {
    failures.push("Account Type must track QBO catalog_type_code (not only 8-value enum)");
  }
  if (!/detailTypesForType|detailOptions/.test(src)) {
    failures.push("Detail Type select must cascade off catalog-code detail list");
  }
  if (!/Make inactive/.test(src)) {
    failures.push("Edit Account must expose Make inactive (QBO label)");
  }
  if (/safeSlug|Date\.now\(\)\.slice/.test(src) && /account_number|accountNumber|accountCode/.test(src)) {
    // Only fail if inventing codes on the create paths we own
    if (/accountCode\s*=\s*`\$\{safeSlug/.test(src) || /`\$\{safeSlug\$\{String\(Date\.now/.test(src)) {
      failures.push("must not invent slug+timestamp account numbers on create");
    }
  }

  const onChangeIdx = src.indexOf('setField("catalog_type_code"');
  const onChangeBlock = onChangeIdx >= 0 ? src.slice(onChangeIdx, onChangeIdx + 280) : "";
  if (onChangeIdx >= 0 && !/setField\("account_subtype", ""\)/.test(onChangeBlock)) {
    failures.push("changing Account Type must reset account_subtype (Detail Type)");
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log(
  `${LABEL} — OK (catalog-code Account Type, cascaded Detail Type, Make inactive, no slug invent)`,
);
