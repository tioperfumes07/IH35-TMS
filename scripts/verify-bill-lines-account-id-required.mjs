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
// 443.182 C step 2 — two-section writes its bill line through the bill engine (insertBillLineOnClient, named columns).
// Each rule accepts the inline INSERT text OR the engine call's named-column text; the rule itself is unchanged.
const ENGINE_LINE_CONTRACT =
  '["category_kind", { value: resolution.category_kind }],\n              ["category_code", { value: resolution.category_code }],\n              ["account_id", { value: resolution.account_id }],\n              ["item_id", { value: row.item_id, cast: "uuid" }],\n              ["quantity", { value: itemQty }],\n              ["rate_cents", { value: itemRateCents }],\n              ["unit_of_measure", { value: itemUom }],';
const BILL_COPY_RULES = [
  [['i.default_expense_account_id::text AS item_account_id'], 'account must come from the catalog item'],
  [['i.operating_company_id = $2::uuid'], 'item lookup must remain company scoped'],
  [['if (!row.item_id || !row.item_account_id)'], 'missing item/account must be refused'],
  [['throw new WorkOrderLineItemError('], 'missing item must throw'],
  [['account_id: row.item_account_id'], 'resolved account must be the item account'],
  [['category_kind, category_code, account_id, item_id, quantity, rate_cents, unit_of_measure', ENGINE_LINE_CONTRACT], 'bill insert must carry account and item contract'],
  [['resolution.account_id,\n              row.item_id,', '["account_id", { value: resolution.account_id }],\n              ["item_id", { value: row.item_id, cast: "uuid" }],'], 'insert values must carry the resolved account and item'],
];
function billCopySection(source) {
  return source.split('async function copyToAccountingLines(')[1]?.split('export async function autoCreateBillFromWO(')[0] ?? '';
}
function billCopyFailures(source) {
  const copy = billCopySection(source);
  return BILL_COPY_RULES.filter(([alts]) => !alts.some((text) => copy.includes(text))).map(([, message]) => message);
}

if (process.argv.includes('--selftest')) {
  const source = fs.readFileSync(twoSectionPath, 'utf8');
  if (billCopyFailures(source).length) fail(billCopyFailures(source));
  // every rule: break whichever accepted form is present — the rule must then fail
  let rejected = 0;
  for (const [alts, message] of BILL_COPY_RULES) {
    const present = alts.filter((text) => billCopySection(source).includes(text));
    if (!present.length) fail([`selftest: no accepted form present for: ${message}`]);
    let broken = source;
    for (const text of present) broken = broken.replaceAll(text, 'BROKEN');
    if (!billCopyFailures(broken).includes(message)) fail([`mutation escaped: ${message}`]);
    rejected += 1;
  }
  console.log(`verify:bill-lines-account-id-required selftest — ${rejected}/${BILL_COPY_RULES.length} mutations rejected`);
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
  if (!/category_kind,\s*category_code,\s*account_id/.test(source) && !/\["category_kind",[^\n]*\n\s*\["category_code",[^\n]*\n\s*\["account_id",/.test(source)) {
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
