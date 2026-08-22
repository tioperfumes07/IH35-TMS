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
if (!/accounting\.payments src_pay/.test(serviceSource)) {
  fail("source display resolver must join accounting.payments for customer_payment (live 0cec933: customer_payment / Source transaction — not visible)");
}
if (!/CASE WHEN jp\.source_transaction_type = 'expense' THEN 'Expense'/.test(serviceSource)) {
  fail("null expense_number must fall back to the word Expense, not a UUID tombstone");
}
if (!/CASE WHEN jp\.source_transaction_type = 'customer_payment' THEN 'Invoice Payment'/.test(serviceSource)) {
  fail("null payment display_id must fall back to Invoice Payment, not Source transaction — not visible");
}
if (!/src_fueltx\.display_label/.test(serviceSource)) {
  fail("source display resolver must keep fuel_event transaction_reference join (Codex ACCT-F5726)");
}
if (/entityLabel\(\s*null\s*,\s*row\.source_transaction_id/.test(pageSource)) {
  fail("AccountingAuditTrailPage must not entityLabel(null, source_transaction_id) — use display_id");
}
if (/entityLabel\(\s*row\.source_transaction_display_id/.test(pageSource)) {
  fail("AccountingAuditTrailPage Source must use visibleDocumentLabel — UUID display_id was tombstoning live rows as Expense — not visible");
}
if (!pageSource.includes("visibleDocumentLabel(")) {
  fail("AccountingAuditTrailPage must use visibleDocumentLabel for Source / lineage document numbers");
}
if (pageSource.includes('"Source transaction"')) {
  fail("AccountingAuditTrailPage must not use generic Source transaction noun — type-specific + SQL display_id");
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
