#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const twoSectionPath = path.join(repoRoot, "apps/backend/src/maintenance/two-section-service.ts");
const resolverPath = path.join(repoRoot, "apps/backend/src/bills/bill-line-account-resolution.service.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0220_block_32_bill_lines_account_id_resolution.sql");

function fail(messages) {
  console.error("verify:bill-lines-account-id-required — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(resolverPath)) {
  failures.push("missing apps/backend/src/bills/bill-line-account-resolution.service.ts");
} else {
  const resolverSource = fs.readFileSync(resolverPath, "utf8");
  if (!/resolveAccountForCategory\(/.test(resolverSource)) {
    failures.push("bill-line account resolution service must call resolveAccountForCategory");
  }
  if (!/bill_line_cross_tenant_refused/.test(resolverSource)) {
    failures.push("bill-line account resolution service must enforce cross-tenant refusal");
  }
}

if (!fs.existsSync(twoSectionPath)) {
  failures.push("missing apps/backend/src/maintenance/two-section-service.ts");
} else {
  const source = fs.readFileSync(twoSectionPath, "utf8");
  if (!/resolveBillLineAccountId\(/.test(source)) {
    failures.push("two-section bill line copy must resolve account_id via bill-line resolver service");
  }
  if (!/category_kind,\s*category_code,\s*account_id/.test(source)) {
    failures.push("accounting.bill_lines inserts must include category_kind, category_code, account_id");
  }
}

if (!fs.existsSync(migrationPath)) {
  failures.push("missing migration 0220 for bill_lines account_id columns");
} else {
  const migrationSource = fs.readFileSync(migrationPath, "utf8");
  if (!/ADD COLUMN IF NOT EXISTS account_id uuid/.test(migrationSource)) {
    failures.push("migration must add accounting.bill_lines.account_id");
  }
  if (!/REFERENCES catalogs\.accounts\(id\)/.test(migrationSource)) {
    failures.push("migration account_id must reference catalogs.accounts(id)");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bill-lines-account-id-required — OK");
