#!/usr/bin/env node
/**
 * verify-je-source-links-invoice-bill-display-id.mjs
 *
 * LV-JE-SOURCE-LINKS-INVOICE-NOT-VISIBLE — GET /api/v1/accounting/journal-entries/:id/source-links
 * (journal-entries.service.ts getJournalEntrySourceLinks) never returned a display name for any
 * source-transaction/linked-object entity, so JournalEntryDetailPage.tsx's "Source links" section
 * always rendered the honest-but-avoidable "Source — not visible" tombstone for every row, even for
 * the two most common real source types (invoice, bill).
 *
 * Fixed by LEFT JOINing accounting.invoices/accounting.bills (both id::text-cast against the TEXT
 * source_transaction_id/linked_object_id columns — never the reverse, per this session's established
 * uuid=text safe-cast direction) and threading source_transaction_display_id/linked_object_display_id
 * through the API type and the frontend render call.
 *
 * Scoped to invoice + bill only (the two verified-live types); the other ~15 observed
 * linked_object_type values still render the same honest fallback until each is individually
 * verified against live schema in a future pass — this guard only asserts the invoice/bill scope
 * doesn't regress, not that every type is resolved.
 *
 * Guards against the safe-cast direction reverting, the new columns being dropped from the SELECT,
 * or the frontend reverting to hardcoded entityLabel(null, ...).
 */
import { readFileSync } from "node:fs";

const servicePath = "apps/backend/src/accounting/journal-entries.service.ts";
const apiTypesPath = "apps/frontend/src/api/accounting.ts";
const pagePath = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";

const serviceSrc = readFileSync(servicePath, "utf8");
const apiSrc = readFileSync(apiTypesPath, "utf8");
const pageSrc = readFileSync(pagePath, "utf8");

const failures = [];

// ACCT-F5682 — extended (not narrowed): the COALESCE now also accepts a bank_categorization
// display label as a THIRD fallback arg after src_bill.display_id. The invoice/bill resolution
// this guard exists to protect is unchanged — src_inv.display_id and src_bill.display_id must
// still be the first two args, in order; anything may follow before the closing AS clause.
if (!/COALESCE\(src_inv\.display_id, src_bill\.display_id(?:, [^)]+)?\) AS source_transaction_display_id/.test(serviceSrc)) {
  failures.push(`${servicePath}: getJournalEntrySourceLinks no longer selects source_transaction_display_id via COALESCE(src_inv.display_id, src_bill.display_id, ...)`);
}
if (!/COALESCE\(link_inv\.display_id, link_bill\.display_id\) AS linked_object_display_id/.test(serviceSrc)) {
  failures.push(`${servicePath}: getJournalEntrySourceLinks no longer selects linked_object_display_id via COALESCE(link_inv.display_id, link_bill.display_id)`);
}
// Safe-cast direction: the uuid side (accounting.invoices/bills.id) must be cast ::text, never the
// TEXT source_transaction_id/linked_object_id cast ::uuid (that direction RAISEs on a non-uuid value).
const forbiddenCastRe = /(jep\.source_transaction_id|tsl\.linked_object_id)\s*::\s*uuid/;
if (forbiddenCastRe.test(serviceSrc)) {
  failures.push(`${servicePath}: found a forbidden ::uuid cast on the TEXT source_transaction_id/linked_object_id column — cast the uuid side (accounting.invoices/bills.id) ::text instead`);
}
if (!/src_inv\.id::text = jep\.source_transaction_id/.test(serviceSrc) || !/link_inv\.id::text = tsl\.linked_object_id/.test(serviceSrc)) {
  failures.push(`${servicePath}: invoice join no longer casts the uuid id column ::text on both source_transaction_id and linked_object_id join arms`);
}

if (!/source_transaction_display_id:\s*string \| null/.test(apiSrc) || !/linked_object_display_id:\s*string \| null/.test(apiSrc)) {
  failures.push(`${apiTypesPath}: JournalEntrySourceLink type no longer declares source_transaction_display_id/linked_object_display_id`);
}

if (!/displayId:\s*candidate\.displayId/.test(pageSrc)) {
  failures.push(`${pagePath}: uniqueSourceRows no longer threads displayId through from the candidate`);
}
if (!/entityLabel\(row\.displayId, row\.id, "Source"\)/.test(pageSrc)) {
  failures.push(`${pagePath}: Source links render reverted to a hardcoded entityLabel(null, row.id, "Source") instead of entityLabel(row.displayId, ...)`);
}

if (failures.length > 0) {
  console.error("verify-je-source-links-invoice-bill-display-id: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-je-source-links-invoice-bill-display-id: OK — invoice/bill source-link display names resolved end-to-end, safe-cast direction intact");
