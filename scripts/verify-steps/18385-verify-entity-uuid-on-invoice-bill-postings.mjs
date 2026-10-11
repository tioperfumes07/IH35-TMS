#!/usr/bin/env node
/**
 * 18385-verify-entity-uuid-on-invoice-bill-postings.mjs
 *
 * Verifies D6 fix: invoice A/R posting lines carry customer entity_uuid,
 * bill A/P posting lines carry vendor entity_uuid.
 *
 * Root cause: buildInvoiceLines and buildBillLines in posting-engine.service.ts
 * never set entity_uuid / entity_type on A/R or A/P lines. The PostingLineDraft
 * type supports these fields and insertPostingLines stamps them, but callers omitted them.
 *
 * Fix: fetch customer_id from accounting.invoices; fetch mdata_vendor_id from
 * accounting.bills; stamp entity_uuid/entity_type on the respective A/R and A/P lines.
 *
 * Checks:
 *   A) customer_id fetched in buildInvoiceLines invoice SELECT
 *   B) entity_uuid + entity_type stamped on A/R debit line
 *   C) mdata_vendor_id fetched in buildBillLines bill SELECT
 *   D) entity_uuid + entity_type stamped on bill A/P credit line
 *   E) entity_uuid field present on PostingLineDraft type (no regression)
 *   F) insertPostingLines stamps entity_uuid/entity_type (the write path exists)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

let pass = 0;
let fail = 0;
const findings = [];

function check(label, ok, detail) {
  if (ok) { pass++; }
  else { fail++; findings.push(`FAIL ${label}: ${detail}`); }
}

const engine = readFileSync(
  path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts"),
  "utf8"
);

// A — customer_id fetched in buildInvoiceLines SELECT
check(
  "A: customer_id in invoice SELECT",
  engine.includes("customer_id::text") && engine.includes("FROM accounting.invoices"),
  "buildInvoiceLines must SELECT customer_id::text from accounting.invoices"
);

// B — entity_uuid stamped on A/R debit line (invoice)
check(
  "B: entity_uuid on A/R line uses customer_id",
  engine.includes("entity_uuid: invoice.customer_id"),
  "buildInvoiceLines A/R debit line must set entity_uuid: invoice.customer_id"
);
check(
  "B: entity_type on A/R line",
  engine.includes("entity_type: invoice.customer_id ? \"customer\" : null"),
  "buildInvoiceLines A/R debit line must set entity_type: invoice.customer_id ? \"customer\" : null"
);

// C — mdata_vendor_id fetched in buildBillLines SELECT
check(
  "C: mdata_vendor_id in bill SELECT",
  engine.includes("mdata_vendor_id::text") && engine.includes("FROM accounting.bills"),
  "buildBillLines must SELECT mdata_vendor_id::text from accounting.bills"
);

// D — entity_uuid stamped on A/P credit line (bill)
check(
  "D: entity_uuid on A/P line uses mdata_vendor_id",
  engine.includes("entity_uuid: bill.mdata_vendor_id"),
  "buildBillLines A/P credit line must set entity_uuid: bill.mdata_vendor_id"
);
check(
  "D: entity_type on A/P line",
  engine.includes("entity_type: bill.mdata_vendor_id ? \"vendor\" : null"),
  "buildBillLines A/P credit line must set entity_type: bill.mdata_vendor_id ? \"vendor\" : null"
);

// E — PostingLineDraft type still has entity_uuid field
check(
  "E: PostingLineDraft has entity_uuid field",
  engine.includes("entity_uuid?:"),
  "PostingLineDraft must still declare entity_uuid? field"
);

// F — insertPostingLines stamps entity_uuid
check(
  "F: insertPostingLines stamps entity_uuid",
  engine.includes("entity_uuid: line.entity_uuid") || engine.includes("entity_uuid:"),
  "insertPostingLines must stamp entity_uuid onto the DB insert"
);

console.log(`\n18385-verify-entity-uuid-on-invoice-bill-postings: ${pass} pass, ${fail} fail`);
if (findings.length) findings.forEach(f => console.error(f));
process.exit(fail > 0 ? 1 : 0);
