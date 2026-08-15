#!/usr/bin/env node
/**
 * verify-pdf-render-date-object-stringify.mjs — LV-PDF-PRINT-DATE-OBJECT-STRINGIFY.
 *
 * ROOT CAUSE: node-postgres returns a `date`/`timestamptz` column as a native JS `Date` object
 * unless the SQL explicitly casts it to `::text`. `String(dateObject)` then produces
 * `Date.prototype.toString()`'s verbose form — e.g. "Tue Aug 11 2026 00:00:00 GMT+0000
 * (Coordinated Universal Time)" — instead of an ISO date string. This is an already-documented,
 * previously-fixed bug CLASS in this codebase (bills.service.ts / void.service.ts /
 * payments.routes.ts all carry comments describing it), but it was never systematically swept.
 * Confirmed live 2026-08-15: GET /api/v1/accounting/invoices/:id.html 500'd on EVERY invoice
 * ("invalid input syntax for type date") because invoice-render.routes.ts bound that verbose
 * string straight into a `$N::date` Postgres parameter. settlement-render.routes.ts and
 * dispatch-sheet.routes.ts had the same shape one step removed — cdl_expiration_date selected
 * with no `::text` cast, then `String(...)`'d for display, rendering the verbose form into every
 * printed settlement and dispatch sheet instead of a clean date.
 *
 * FIX (both patterns are acceptable and both are asserted per-site below):
 *   (a) cast the source column to ::text in the SQL, so the value is already a safe string, or
 *   (b) check `value instanceof Date` before formatting/binding it.
 * Never `String(value)` a value that might be a raw Date column without one of the above.
 *
 * Usage:
 *   node scripts/verify-pdf-render-date-object-stringify.mjs            # scan
 *   node scripts/verify-pdf-render-date-object-stringify.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pdf-render-date-object-stringify";

const INVOICE_RENDER = "apps/backend/src/accounting/invoice-render.routes.ts";
const SETTLEMENT_RENDER = "apps/backend/src/driver-finance/settlement-render.routes.ts";
const DISPATCH_SHEET = "apps/backend/src/dispatch/dispatch-sheet.routes.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];

  const invoiceRender = readRel(root, INVOICE_RENDER, overrides);
  if (!invoiceRender) {
    problems.push(`missing ${INVOICE_RENDER}`);
  } else {
    if (!/issueDateValue instanceof Date/.test(invoiceRender)) {
      problems.push(`${INVOICE_RENDER}: invoiceDate must check issueDateValue instanceof Date before binding it as a ::date param (LV-PDF-PRINT-DATE-OBJECT-STRINGIFY)`);
    }
    if (/const invoiceDate = String\(invoice\.issue_date\);/.test(invoiceRender)) {
      problems.push(`${INVOICE_RENDER}: must not bare-String() invoice.issue_date before the ::date bind`);
    }
    if (/formatInvoiceIssuedLines\(String\(invoice\.issue_date\)/.test(invoiceRender)) {
      problems.push(`${INVOICE_RENDER}: formatInvoiceIssuedLines already accepts Date | string — do not pre-String() the Date value`);
    }
  }

  const settlementRender = readRel(root, SETTLEMENT_RENDER, overrides);
  if (!settlementRender) {
    problems.push(`missing ${SETTLEMENT_RENDER}`);
  } else {
    if (!/d\.cdl_expires_at::text AS cdl_expiration_date/.test(settlementRender)) {
      problems.push(`${SETTLEMENT_RENDER}: cdl_expires_at must be cast ::text in the SQL (raw column would return a JS Date)`);
    }
    if (/String\(settlement\.cdl_expiration_date\)/.test(settlementRender)) {
      problems.push(`${SETTLEMENT_RENDER}: cdlExp must use formatDate(), not bare String()`);
    }
  }

  const dispatchSheet = readRel(root, DISPATCH_SHEET, overrides);
  if (!dispatchSheet) {
    problems.push(`missing ${DISPATCH_SHEET}`);
  } else {
    if (!/d\.cdl_expires_at::text AS cdl_expiration_date/.test(dispatchSheet)) {
      problems.push(`${DISPATCH_SHEET}: cdl_expires_at must be cast ::text in the SQL (raw column would return a JS Date)`);
    }
    if (/String\(load\.cdl_expiration_date\)/.test(dispatchSheet)) {
      problems.push(`${DISPATCH_SHEET}: cdlExp must use formatDate(), not bare String()`);
    }
  }

  return problems;
}

export function run() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return { ok: false, offenders: problems };
  }
  console.log(`${LABEL}: PASS — invoice/settlement/dispatch-sheet PDF renders never String() a raw Date column`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const invoiceReal = readRel(ROOT, INVOICE_RENDER);
  const settlementReal = readRel(ROOT, SETTLEMENT_RENDER);
  const dispatchReal = readRel(ROOT, DISPATCH_SHEET);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "invoice-date-crash-reintroduced",
    {
      [INVOICE_RENDER]: invoiceReal.replace(
        /const issueDateValue = invoice\.issue_date;\n\s*const invoiceDate =\n\s*issueDateValue instanceof Date \? issueDateValue\.toISOString\(\)\.slice\(0, 10\) : String\(issueDateValue\);/,
        "const invoiceDate = String(invoice.issue_date);",
      ),
    },
    "must check issueDateValue instanceof Date"
  );
  plant(
    "invoice-issued-lines-re-stringified",
    {
      [INVOICE_RENDER]: invoiceReal.replace(
        "formatInvoiceIssuedLines(invoice.issue_date as string | Date, invoice.due_date as string | Date, paymentTermsLabel)",
        "formatInvoiceIssuedLines(String(invoice.issue_date), String(invoice.due_date), paymentTermsLabel)",
      ),
    },
    "do not pre-String()"
  );
  plant(
    "settlement-cast-dropped",
    { [SETTLEMENT_RENDER]: settlementReal.replace("d.cdl_expires_at::text AS cdl_expiration_date,", "d.cdl_expires_at AS cdl_expiration_date,") },
    "must be cast ::text"
  );
  plant(
    "settlement-display-reverted",
    { [SETTLEMENT_RENDER]: settlementReal.replace("formatDate(settlement.cdl_expiration_date)", "String(settlement.cdl_expiration_date)") },
    "must use formatDate()"
  );
  plant(
    "dispatch-cast-dropped",
    { [DISPATCH_SHEET]: dispatchReal.replace("d.cdl_expires_at::text AS cdl_expiration_date,", "d.cdl_expires_at AS cdl_expiration_date,") },
    "must be cast ::text"
  );
  plant(
    "dispatch-display-reverted",
    { [DISPATCH_SHEET]: dispatchReal.replace("formatDate(load.cdl_expiration_date)", "String(load.cdl_expiration_date)") },
    "must use formatDate()"
  );

  console.log(`${LABEL} SELFTEST PASS — 6 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
