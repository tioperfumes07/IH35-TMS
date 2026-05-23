#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "db/migrations/0218_accounting_expense_category_account_map.sql");
const routesPath = path.join(process.cwd(), "apps/backend/src/accounting/expense-category-map/routes.ts");
const resolverPath = path.join(process.cwd(), "apps/backend/src/accounting/expense-category-map/resolver.service.ts");

function fail(messages) {
  console.error("verify:expense-category-map-tenant-scope — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(migrationPath)) {
  failures.push("missing migration 0218_accounting_expense_category_account_map.sql");
} else {
  const migration = fs.readFileSync(migrationPath, "utf8");
  if (!/CREATE TABLE IF NOT EXISTS accounting\.expense_category_account_map/i.test(migration)) {
    failures.push("migration must create accounting.expense_category_account_map");
  }
  if (!/operating_company_id uuid NOT NULL/i.test(migration)) {
    failures.push("migration must include operating_company_id column");
  }
  if (!/ALTER TABLE accounting\.expense_category_account_map ENABLE ROW LEVEL SECURITY/i.test(migration)) {
    failures.push("migration must enable RLS on expense_category_account_map");
  }
  if (!/CREATE POLICY expense_category_account_map_company_scope/i.test(migration)) {
    failures.push("migration must define expense_category_account_map_company_scope policy");
  }
  if (!/current_setting\('app\.operating_company_id', true\)/i.test(migration)) {
    failures.push("policy must scope rows by app.operating_company_id");
  }
}

if (!fs.existsSync(routesPath)) {
  failures.push("missing expense-category-map routes.ts");
} else {
  const routes = fs.readFileSync(routesPath, "utf8");
  if (!/withCompanyScope\(/.test(routes)) {
    failures.push("routes must execute through withCompanyScope");
  }
  if (!/hasCompanyAccess\(/.test(routes)) {
    failures.push("routes must explicitly check tenant access");
  }
  if (!/operating_company_id/.test(routes)) {
    failures.push("routes must carry operating_company_id through request parsing");
  }
}

if (!fs.existsSync(resolverPath)) {
  failures.push("missing expense-category-map resolver.service.ts");
} else {
  const resolver = fs.readFileSync(resolverPath, "utf8");
  if (!/WHERE operating_company_id = \$1::uuid/.test(resolver)) {
    failures.push("resolver must resolve by operating_company_id");
  }
  if (!/is_active = true/.test(resolver)) {
    failures.push("resolver must select only active mappings");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:expense-category-map-tenant-scope — OK");
