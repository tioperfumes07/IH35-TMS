#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routesPath = path.join(repoRoot, "apps/backend/src/accounting/expense-category-map/routes.ts");

function fail(messages) {
  console.error("verify:expense-category-map-soft-delete — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(routesPath)) {
  failures.push("missing routes.ts for expense-category-map");
} else {
  const routes = fs.readFileSync(routesPath, "utf8");
  if (/DELETE\s+FROM\s+accounting\.expense_category_account_map/i.test(routes)) {
    failures.push("hard DELETE detected in routes.ts; use soft delete (is_active=false)");
  }
  if (!/SET is_active = false/i.test(routes)) {
    failures.push("soft-delete path must set is_active = false");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:expense-category-map-soft-delete — OK");
