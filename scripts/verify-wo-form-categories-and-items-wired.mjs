#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const target = path.join(ROOT, "apps/frontend/src/pages/maintenance/WorkOrderCreateModal.tsx");

function fail(message) {
  console.error(`verify:wo-form-categories-and-items-wired — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail("WorkOrderCreateModal.tsx not found");
}

const text = fs.readFileSync(target, "utf8");
if (!text.includes("useAccountingCategoriesQuery")) {
  fail("WorkOrderCreateModal must import/use useAccountingCategoriesQuery");
}
if (!text.includes("useAccountingItemsQuery")) {
  fail("WorkOrderCreateModal must import/use useAccountingItemsQuery");
}
if (!text.includes("SelectCombobox")) {
  fail("WorkOrderCreateModal must feed comboboxes with query results");
}
if (!text.includes("category_id") || !text.includes("item_id")) {
  fail("WorkOrderCreateModal must store selected category_id and item_id on line state");
}

const categoriesHook = path.join(ROOT, "apps/frontend/src/hooks/useAccountingCategoriesQuery.ts");
const itemsHook = path.join(ROOT, "apps/frontend/src/hooks/useAccountingItemsQuery.ts");
for (const file of [categoriesHook, itemsHook]) {
  if (!fs.existsSync(file)) fail(`${path.relative(ROOT, file)} not found`);
}

const categoriesHookText = fs.readFileSync(categoriesHook, "utf8");
if (!categoriesHookText.includes("/api/v1/accounting/categories")) {
  fail("useAccountingCategoriesQuery must call /api/v1/accounting/categories");
}

const itemsHookText = fs.readFileSync(itemsHook, "utf8");
if (!itemsHookText.includes("/api/v1/accounting/items-for-wo")) {
  fail("useAccountingItemsQuery must call /api/v1/accounting/items-for-wo");
}

console.log("verify:wo-form-categories-and-items-wired — OK");
