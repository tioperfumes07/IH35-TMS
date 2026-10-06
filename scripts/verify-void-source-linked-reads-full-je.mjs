#!/usr/bin/env node
/**
 * ACCT-F10181 — void of a source-linked document must reverse the FULL journal entry
 * that contains any source-linked posting, not only the tagged lines.
 *
 * Live fail (2026-08-31): Invoice L-20260830-0020 / 35ce61d1… Void UI →
 * void_reversal_requires_debit_and_credit because A/R debit was tagged source=invoice
 * but the income credit on the same JE was untagged.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = join(root, "apps/backend/src/accounting/void.service.ts");

function fail(msg) {
  console.error(`verify-void-source-linked-reads-full-je: FAIL — ${msg}`);
  process.exit(1);
}

const src = readFileSync(servicePath, "utf8");
// The reader's own body only: void.service.ts has a second SELECT DISTINCT … source_transaction_type = $3 (the
// reversal back-link stamper), which let a regression in the reader pass on the file as a whole (LST-F413).
function readerBody(text) {
  const start = text.indexOf("async function readOriginalGlPostings");
  if (start < 0) return "";
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end < 0 ? undefined : end);
}
const reader = readerBody(src);

// Must expand via JE header set, not source-only WHERE.
if (!/journal_entry_uuid\s+IN\s*\(/.test(reader)) {
  fail("readOriginalGlPostings non-JE branch must select via journal_entry_uuid IN (…)");
}
// Table alias optional: the 2026-09-23 liveness fix aliased the subquery (jep.journal_entry_uuid,
// jep.source_transaction_type) and joined journal_entries, which an unaliased match missed (LST-F413).
if (!/SELECT DISTINCT (?:\w+\.)?journal_entry_uuid[\s\S]{0,700}?(?:\w+\.)?source_transaction_type\s*=\s*\$3/.test(reader)) {
  fail("IN-subquery must discover JE ids from source_transaction_type/id ($3/$2)");
}
// Forbidden regression: sole filter is source_transaction_type/id without JE expansion.
const nonJeBranch = src.slice(src.indexOf("async function readOriginalGlPostings"));
const returnIdx = nonJeBranch.indexOf("return res.rows.map", nonJeBranch.indexOf("invoice / bill"));
const branch = nonJeBranch.slice(0, returnIdx > 0 ? returnIdx : 2500);
if (
  /source_transaction_type\s*=\s*\$3[\s\S]{0,120}?source_transaction_id\s*=\s*\$2/.test(branch) &&
  !/journal_entry_uuid\s+IN/.test(branch)
) {
  fail("source-only SELECT without JE expansion is the live VOID-10 defect — forbidden");
}

if (process.argv.includes("--selftest")) {
  const planted = src.replace(
    /journal_entry_uuid\s+IN\s*\([\s\S]*?\)\s*ORDER BY line_sequence ASC/,
    `source_transaction_type = $3
        AND source_transaction_id = $2
      ORDER BY line_sequence ASC`,
  );
  if (planted === src) fail("--selftest could not plant source-only regression");
  if (/journal_entry_uuid\s+IN\s*\(/.test(planted.slice(planted.indexOf("async function readOriginalGlPostings")))) {
    fail("--selftest planted source-only still matched JE IN expand");
  }
  console.log("verify-void-source-linked-reads-full-je --selftest: OK — planted source-only rejected");
  process.exit(0);
}

console.log(
  "verify-void-source-linked-reads-full-je: OK — void reader expands to full JE for source-linked docs (ACCT-F10181)",
);
