#!/usr/bin/env node
/**
 * verify-acct-coa-roles-createkind-account — CoA Roles / expense-map +Create (27/28).
 *
 * Root cause: CoA Roles and Expense Category Map account pickers used createKind="category"
 * (QuickCreateEntityModal) while labeling "+ Add new account". Nested create must open the
 * rich account InlineCreateDrawer (createKind="account"), matching Manual JE / A/P gold.
 *
 * Fix: createKind="account" on both pickers. No Neon seed / posting.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-coa-roles-createkind-account";

const FILES = [
  "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
  "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx",
];

function assertAccountCreateKind(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const anchor = src.indexOf('addNewLabel="+ Add new account"');
  if (anchor < 0) {
    throw new Error(`${rel}: expected + Add new account label`);
  }
  // Look back ~400 chars for createKind on the same ReferenceSelect
  const window = src.slice(Math.max(0, anchor - 400), anchor + 80);
  if (!window.includes('createKind="account"')) {
    throw new Error(`${rel}: account picker must use createKind="account"`);
  }
  const withoutComments = window.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (withoutComments.includes('createKind="category"')) {
    throw new Error(`${rel}: account picker must NOT use createKind="category"`);
  }
  console.log(`OK: ${rel}`);
}

for (const rel of FILES) {
  assertAccountCreateKind(rel);
}
console.log(`PASS: ${LABEL}`);
