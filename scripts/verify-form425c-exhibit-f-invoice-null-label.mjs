#!/usr/bin/env node
/**
 * F425C-EXHIBIT-F-INVOICE-NULL-LABEL — Exhibit F's supporting-documents schedule already fixed
 * this exact defect class for bills (billReference(): "Bill null" with a raw uuid, when
 * bill_number was absent) but the invoice path still did `label: \`Invoice ${row.display_id}\``
 * with no fallback — a null display_id would render the literal "Invoice null". Unreachable
 * against prod data today (accounting.invoices has 0 rows system-wide as of this fix) but this is
 * the identical latent bug billReference() was written to close, in the same file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibit-f-invoice-null-label";
const FILE = "apps/backend/src/reports/form-425c/exhibits/exhibit-f-supporting-docs.ts";

export function collectProblems(src) {
  const problems = [];
  if (!/export function invoiceReference/.test(src)) {
    problems.push(`${FILE}: must export invoiceReference(), mirroring billReference()`);
  }
  if (/label: `Invoice \$\{row\.display_id\}`/.test(src)) {
    problems.push(`${FILE}: invoice label must not interpolate row.display_id directly — a null value renders the literal "Invoice null"`);
  }
  if (!/reference_id: ref,\s*\n\s*evidence_uuid: null,\s*\n\s*label: `Invoice \$\{ref\}`/.test(src)) {
    problems.push(`${FILE}: invoice label/reference_id must both come from invoiceReference(row)`);
  }
  if (!/c\.customer_name/.test(src)) {
    problems.push(`${FILE}: the invoice query must join a customer name so invoiceReference() has a real fallback field, not just an id`);
  }
  return problems;
}

const good = `
export function invoiceReference(row) {}
      SELECT i.id, i.display_id, c.customer_name, i.total_cents, i.issue_date::text AS invoice_date
    const ref = invoiceReference(row);
    documents.push({
      doc_type: "invoice",
      reference_id: ref,
      evidence_uuid: null,
      label: \`Invoice \${ref}\`,
`;
const bad = `
      SELECT i.id, i.display_id, i.total_cents, i.issue_date::text AS invoice_date
    documents.push({
      doc_type: "invoice",
      reference_id: String(row.display_id ?? row.id),
      evidence_uuid: null,
      label: \`Invoice \${row.display_id}\`,
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 3) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Exhibit F invoice rows never render "Invoice null" or a raw uuid, matching the bill-row standard`);
process.exit(0);
