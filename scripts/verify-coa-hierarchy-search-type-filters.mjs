#!/usr/bin/env node
/**
 * Owner 2026-07-23: CoA must nest subaccounts under parents (QBO), not flat-sort by name.
 * Guard: hierarchy helpers + list page search + account-type filter + no account_number as type sublabel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const utils = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/lists/accounting/coa-list-utils.ts"),
  "utf8"
);
if (!utils.includes("filterCoaHierarchySearch")) {
  failures.push("coa-list-utils must export filterCoaHierarchySearch");
}
if (!utils.includes("siblingSort")) {
  failures.push("orderCoaHierarchy must accept siblingSort (preserve parent→child)");
}
if (!utils.includes("Never flat-sort") && !utils.includes("NEVER flat-sort")) {
  failures.push("orderCoaHierarchy must document that flat name-sort is forbidden for hierarchy");
}

const page = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"),
  "utf8"
);
if (!page.includes('data-testid="coa-list-search"')) {
  failures.push("Chart of Accounts must expose mid-bar search (coa-list-search)");
}
if (!page.includes("filterCoaHierarchySearch")) {
  failures.push("ChartOfAccountsListPage must use filterCoaHierarchySearch");
}
if (!page.includes('id: "acct_type"') && !page.includes("id: \"acct_type\"")) {
  failures.push("Chart of Accounts must offer Account type multiselect filter");
}
if (page.includes("[...rows].sort") && !page.includes("FLAT_SORT_KEYS")) {
  failures.push("CoA list must not flat-sort all columns — only balance columns may flat-sort");
}
if (!page.includes("orderCoaHierarchy(baseRows")) {
  failures.push("CoA list must order via orderCoaHierarchy (sibling sort)");
}

if (!page.includes('data-testid="coa-show-account-numbers-toggle"')) {
  failures.push("Chart of Accounts must expose Show account numbers toggle");
}
if (!page.includes("coa-parent-account-name") && !page.includes("hasChildren ? \"font-semibold underline")) {
  failures.push("Parent accounts with subaccounts must be underlined in the CoA list");
}

const drawer = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx"),
  "utf8"
);
if (/sublabel:\s*a\.account_number/.test(drawer)) {
  failures.push("AccountDrawer parent picker must not use account_number as type/sublabel");
}
if (!drawer.includes("formatAccountDisplayLabel") || !drawer.includes("formatReferenceTypeLabel")) {
  failures.push("AccountDrawer parent picker must use name-first label + account type sublabel");
}
if (!drawer.includes("Make inactive")) {
  failures.push("AccountDrawer edit mode must expose Make inactive");
}
if (!drawer.includes("detailTypesForCatalogCode") || !drawer.includes("catalog_type_code")) {
  failures.push("AccountDrawer must cascade Detail Type from QBO catalog_type_code");
}

const ref = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/parity/ReferenceSelect.tsx"),
  "utf8"
);
if (!ref.includes('data-testid="reference-select-account-type-filter"')) {
  failures.push("ReferenceSelect account pickers must expose Type filter");
}

const leakFiles = [
  "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx",
  "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
  "apps/frontend/src/components/driver-finance/PaymentMethodPicker.tsx",
];
for (const rel of leakFiles) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (/sublabel:\s*a\.account_number/.test(src)) {
    failures.push(`${rel}: must not put account_number in Combobox sublabel (type column)`);
  }
}

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("verify-coa-hierarchy-search-type-filters — OK");
