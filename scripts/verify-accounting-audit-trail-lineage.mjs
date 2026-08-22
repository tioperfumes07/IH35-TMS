#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/service.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx");

function fail(message) {
  console.error(`verify:accounting-audit-trail-lineage — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [routePath, servicePath, pagePath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

if (!routeSource.includes("/api/v1/accounting/audit-trail/source-lineage")) {
  fail("source-lineage endpoint must be registered");
}
if (!/jp\.source_transaction_type = \$2::text/.test(serviceSource)) {
  fail("lineage query must filter by source_transaction_type");
}
if (!/jp\.source_transaction_id = \$3::text/.test(serviceSource)) {
  fail("lineage query must filter by source_transaction_id");
}
if (!serviceSource.includes("accounting.transaction_source_links")) {
  fail("lineage query must include transaction_source_links join");
}
if (!serviceSource.includes("source_transaction_display_id")) {
  fail("audit trail list/lineage must resolve source_transaction_display_id (invoice/bill/expense/bank)");
}
if (!/src_bill\.bill_number/.test(serviceSource) || !/src_exp\.expense_number/.test(serviceSource)) {
  fail("source display resolver must use bill_number + expense_number (not UUID chrome)");
}
if (/entityLabel\(\s*null\s*,\s*row\.source_transaction_id/.test(pageSource)) {
  fail("AccountingAuditTrailPage must not entityLabel(null, source_transaction_id) — use display_id");
}
if (/entityLabel\(\s*null\s*,\s*row\.linked_object_id/.test(pageSource)) {
  fail("AccountingAuditTrailPage must not entityLabel(null, linked_object_id) — use display_id");
}
// The real filter now reads/writes through a staged-filter draft (Apply/Cancel/Reset —
// staged.draft.accountId / staged.setDraft({ ..., accountId })) rather than binding the
// SelectCombobox directly to the applied `accountId` state — a later, stricter UX pattern than an
// immediate-apply binding. Accept either `value={accountId}` or `value={staged.draft.accountId}`
// (bounded to a plain dotted-identifier chain, not an unbounded window).
if (!/<SelectCombobox[\s\S]*?value=\{(?:staged\.draft\.)?accountId\}/.test(pageSource)) {
  fail("audit trail account filter must use the searchable select adapter");
}
if (/<select[\s\S]*?value=\{(?:staged\.draft\.)?accountId\}/.test(pageSource)) {
  fail("audit trail account filter must not regress to a native account-ID select");
}

console.log("verify:accounting-audit-trail-lineage — OK");
