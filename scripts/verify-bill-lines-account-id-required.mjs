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

// Item-account resolution replaced description/category inference in #26736.
// Assert the actual bill-copy data flow, not a retired function's spelling.
function billCopyFailures(source) {
  const copy = source.split('async function copyToAccountingLines(')[1]?.split('export async function autoCreateBillFromWO(')[0] ?? '';
  const rules = [
    ['i.default_expense_account_id::text AS item_account_id', 'account must come from the catalog item'],
    ['i.operating_company_id = $2::uuid', 'item lookup must remain company scoped'],
    ['if (!row.item_id || !row.item_account_id)', 'missing item/account must be refused'],
    ['throw new WorkOrderLineItemError(', 'missing item must throw'],
    ['account_id: row.item_account_id', 'resolved account must be the item account'],
    ['category_kind, category_code, account_id, item_id, quantity, rate_cents, unit_of_measure', 'bill insert must carry account and item contract'],
    ['resolution.account_id,\n              row.item_id,', 'insert values must carry the resolved account and item'],
  ];
  return rules.filter(([text]) => !copy.includes(text)).map(([, message]) => message);
}

if (process.argv.includes('--selftest')) {
  const source = fs.readFileSync(twoSectionPath, 'utf8');
  if (billCopyFailures(source).length) fail(billCopyFailures(source));
  const mutations = [
    'i.default_expense_account_id::text AS item_account_id',
    'i.operating_company_id = $2::uuid',
    'if (!row.item_id || !row.item_account_id)',
    'throw new WorkOrderLineItemError(',
    'account_id: row.item_account_id',
    'category_kind, category_code, account_id, item_id, quantity, rate_cents, unit_of_measure',
    'resolution.account_id,\n              row.item_id,',
  ];
  for (const token of mutations) {
    if (!billCopyFailures(source.replaceAll(token, 'BROKEN')).length) fail([`mutation escaped: ${token}`]);
  }
  console.log('verify:bill-lines-account-id-required selftest — 7/7 mutations rejected');
  process.exit(0);
}

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
  failures.push(...billCopyFailures(source));
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
