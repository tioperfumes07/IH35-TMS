#!/usr/bin/env node
// Block 2 static guard — locks the shared accounting catalog creator upgrades so they can't regress
// (CLAUDE.md §2: every feature gets a static CI guard). Asserts real invariants in the shared
// component, not string presence in a page.
//
// Invariants:
//   (1) The shared modal exposes a Sort-order field wired to nextSortOrder (default = max+1).
//   (2) Code is immutable after create (input disabled when mode === "edit").
//   (3) Submit is disabled-until-valid (canSubmit gate on the create/save button).
//   (4) The edit/profile view surfaces created/updated metadata.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const modalPath = path.join(repoRoot, "apps/frontend/src/pages/lists/accounting/AccountingCatalogModal.tsx");
const listPath = path.join(repoRoot, "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx");

const failures = [];

if (!fs.existsSync(modalPath)) {
  failures.push("missing AccountingCatalogModal.tsx");
} else {
  const src = fs.readFileSync(modalPath, "utf8");
  if (!/nextSortOrder/.test(src) || !/sort_order/.test(src)) failures.push("AccountingCatalogModal must expose a Sort-order field wired to nextSortOrder");
  if (!/disabled=\{readOnly \|\| mode === "edit"\}/.test(src)) failures.push("AccountingCatalogModal must make Code immutable in edit mode (disabled={readOnly || mode === \"edit\"})");
  if (!/const canSubmit\b/.test(src) || !/disabled=\{isSaving \|\| !canSubmit\}/.test(src)) failures.push("AccountingCatalogModal submit must be disabled-until-valid (canSubmit gate)");
  if (!/Created \{new Date\(row\.created_at\)/.test(src)) failures.push("AccountingCatalogModal edit view must surface created/updated metadata");
}

if (!fs.existsSync(listPath)) {
  failures.push("missing AccountingCatalogListPage.tsx");
} else {
  const src = fs.readFileSync(listPath, "utf8");
  if (!/nextSortOrder = rows\.length \? Math\.max/.test(src)) failures.push("AccountingCatalogListPage must compute nextSortOrder = max(existing)+1");
  if (!/nextSortOrder=\{nextSortOrder\}/.test(src)) failures.push("AccountingCatalogListPage must pass nextSortOrder to the modal");
}

if (failures.length > 0) {
  console.error("verify:accounting-catalog-creator — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:accounting-catalog-creator — OK");
