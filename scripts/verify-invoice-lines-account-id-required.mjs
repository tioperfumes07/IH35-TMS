#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const resolverPath = path.join(repoRoot, "apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts");
const routesPath = path.join(repoRoot, "apps/backend/src/accounting/invoice-lines.routes.ts");
const fromLoadPath = path.join(repoRoot, "apps/backend/src/accounting/from-load.ts");
const recurringPath = path.join(repoRoot, "apps/backend/src/accounting/recurring.worker.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0221_block_33_invoice_line_revenue_mapping.sql");

function fail(messages) {
  console.error("verify:invoice-lines-account-id-required — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(resolverPath)) {
  failures.push("missing apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts");
} else {
  const source = fs.readFileSync(resolverPath, "utf8");
  if (!/resolveAccountForCategory\(\s*operating_company_id,\s*"revenue"/.test(source)) {
    failures.push("invoice-line revenue resolver must call resolveAccountForCategory(..., 'revenue', ...)");
  }
}

for (const filePath of [routesPath, fromLoadPath, recurringPath]) {
  if (!fs.existsSync(filePath)) {
    failures.push(`missing ${path.relative(repoRoot, filePath)}`);
    continue;
  }
  const source = fs.readFileSync(filePath, "utf8");
  if (!/resolveInvoiceLineRevenueAccountId\(/.test(source)) {
    failures.push(`${path.relative(repoRoot, filePath)} must resolve invoice-line account_id via revenue resolver`);
  }
}

if (!fs.existsSync(migrationPath)) {
  failures.push("missing 0221 migration for invoice_lines account_id/revenue_code");
} else {
  const source = fs.readFileSync(migrationPath, "utf8");
  if (!/ADD COLUMN IF NOT EXISTS revenue_code text/.test(source)) {
    failures.push("migration must add accounting.invoice_lines.revenue_code");
  }
  if (!/ADD COLUMN IF NOT EXISTS account_id uuid/.test(source)) {
    failures.push("migration must add accounting.invoice_lines.account_id");
  }
  if (!/REFERENCES catalogs\.accounts\(id\)/.test(source)) {
    failures.push("migration invoice_lines.account_id must reference catalogs.accounts(id)");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:invoice-lines-account-id-required — OK");
