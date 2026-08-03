#!/usr/bin/env node
/**
 * GUARD: ACCT-F100 — posting-engine.service.ts must refuse Invoice→GL for
 * source_system=qbo (parallel books). Without this guard, deploying the date
 * fix + running a backfill would create 11,976 duplicate journal entries for
 * QBO-origin invoices whose GL already lives in QuickBooks Online.
 *
 * This guard asserts the QBO_INVOICE_POST_GL_REFUSED error code exists in the
 * PostingErrorCode type and that the buildInvoiceLines function checks source_system.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SELFTEST = process.argv.includes("--selftest");
const FILE = resolve("apps/backend/src/accounting/posting-engine.service.ts");

if (SELFTEST) {
  const safe = `if ((invoice.source_system ?? "").toLowerCase() === "qbo") {\n    throw new PostingEngineError(\n      "QBO_INVOICE_POST_GL_REFUSED",`;
  if (!/QBO_INVOICE_POST_GL_REFUSED/.test(safe)) {
    console.error("SELFTEST FAIL: QBO_INVOICE_POST_GL_REFUSED not detected");
    process.exit(1);
  }
  const dangerous = `const invoice = invoiceRes.rows[0];\n  if (!invoice) throw new PostingEngineError("SOURCE_NOT_FOUND");`;
  if (/QBO_INVOICE_POST_GL_REFUSED/.test(dangerous)) {
    console.error("SELFTEST FAIL: false positive on dangerous pattern");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
  process.exit(0);
}

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch {
  console.error(`FAIL: cannot read ${FILE}`);
  process.exit(1);
}

// The file must contain QBO_INVOICE_POST_GL_REFUSED in the error code type
if (!/QBO_INVOICE_POST_GL_REFUSED/.test(src)) {
  console.error(
    "FAIL: posting-engine.service.ts does not contain QBO_INVOICE_POST_GL_REFUSED.\n" +
    "Without this guard, invoice backfill would create duplicate JEs for QBO-origin invoices.\n" +
    "See ACCT-F100 / audit row 668."
  );
  process.exit(1);
}

// The file must check source_system in the invoice poster
if (!/source_system.*qbo.*QBO_INVOICE_POST_GL_REFUSED/s.test(src)) {
  console.error(
    "FAIL: posting-engine.service.ts has the error code but does not check source_system=qbo before throwing it.\n" +
    "The buildInvoiceLines function must refuse QBO-origin invoices."
  );
  process.exit(1);
}

console.log("PASS: invoice poster has QBO-origin guard (QBO_INVOICE_POST_GL_REFUSED)");
