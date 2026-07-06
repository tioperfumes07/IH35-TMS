#!/usr/bin/env node
/**
 * Static guard for BLOCK-17/24 §8: an ISSUED accounting.form_1099_nec / accounting.form_1042_s /
 * accounting.tax_document row must be immutable at the DB level (not just app-layer discipline) —
 * only a void (voided_at/voided_reason + status='voided') may still change it. This locks the
 * trigger-based enforcement in the HELD migration so it can't be silently dropped or weakened in
 * a later edit. Live-behavior was verified locally against a scratch Postgres DB when this
 * migration was authored (UPDATE of a box value on an issued row raised; the void update
 * succeeded) — this guard is the static regression lock for that verified behavior.
 *
 * Pure file-content check against the held migration — no DB required.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "db/migrations/202607130100_block17_24_tax_document_engine.sql";

let failed = 0;
function fail(msg) {
  console.error(`verify-tax-document-immutability: ${msg}`);
  failed = 1;
}

const p = path.join(ROOT, MIGRATION);
if (!fs.existsSync(p)) {
  fail(`expected file is missing: ${MIGRATION}`);
  process.exit(1);
}
const sql = fs.readFileSync(p, "utf8");

const requiredFunctions = [
  "accounting.block_issued_1099_nec_mutation",
  "accounting.block_issued_1042_s_mutation",
  "accounting.block_issued_tax_document_pdf_mutation",
];
for (const fn of requiredFunctions) {
  if (!sql.includes(`CREATE OR REPLACE FUNCTION ${fn}`)) {
    fail(`${MIGRATION} is missing the immutability trigger function ${fn}()`);
  }
}

const requiredTriggers = [
  ["trg_block_issued_1099_nec_mutation", "accounting.form_1099_nec"],
  ["trg_block_issued_1042_s_mutation", "accounting.form_1042_s"],
  ["trg_block_issued_tax_document_pdf_mutation", "accounting.tax_document"],
];
for (const [trigger, table] of requiredTriggers) {
  const re = new RegExp(`CREATE TRIGGER ${trigger}\\s*\\n?BEFORE UPDATE ON ${table.replace(".", "\\.")}`, "i");
  if (!re.test(sql)) {
    fail(`${MIGRATION} is missing BEFORE UPDATE trigger ${trigger} on ${table}`);
  }
}

if (!/RAISE EXCEPTION 'accounting\.form_1099_nec is issued/.test(sql)) {
  fail(`${MIGRATION} form_1099_nec trigger must RAISE EXCEPTION when box values change on an issued row.`);
}
if (!/RAISE EXCEPTION 'accounting\.form_1042_s is issued/.test(sql)) {
  fail(`${MIGRATION} form_1042_s trigger must RAISE EXCEPTION when box values change on an issued row.`);
}
if (!/NEW\.status <> 'voided'/.test(sql)) {
  fail(`${MIGRATION} immutability triggers must still allow a transition to 'voided' (void-not-delete) — found no such exception.`);
}

// No DELETE grant anywhere in this cluster (checked structurally: explicit REVOKE DELETE present
// for every one of the five new tables this migration creates).
const revokeDeleteTargets = [
  "catalogs.payee_tax_profile",
  "accounting.tax_document_batch",
  "accounting.tax_document",
  "accounting.form_1099_nec",
  "accounting.form_1042_s",
];
for (const table of revokeDeleteTargets) {
  if (!new RegExp(`REVOKE DELETE ON ${table.replace(".", "\\.")} FROM ih35_app`).test(sql)) {
    fail(`${MIGRATION} must REVOKE DELETE ON ${table} FROM ih35_app (accounting/catalogs schemas carry default privileges that otherwise silently re-grant DELETE — verified locally).`);
  }
}

if (failed) {
  console.error("verify-tax-document-immutability: FAILED");
  process.exit(1);
}
console.log("verify-tax-document-immutability: OK — issued-row immutability triggers + void-not-delete grants are present and intact.");
