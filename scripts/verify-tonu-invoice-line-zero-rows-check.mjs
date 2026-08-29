#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["tonu_invoice","connectivity"],"leaves":["dispatch.tonu.invoice_line.zero_rows_check"],"task":"DSP-MONEY-F7196-TONU-INVOICE-LINE-ZERO-ROW-COMMITS-HEADER","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7196-TONU-INVOICE-LINE-ZERO-ROW-COMMITS-HEADER (CC-1, 2026-08-29): TONU cancellation
 * invoicing's createTonuInvoiceForCancellation already checks its invoice-header INSERT for a
 * zero-row result (`if (!invoiceId) throw ...`), but converted a missing
 * `accounting.invoice_lines INSERT ... RETURNING id` row to an empty string and continued into
 * recomputeInvoiceTotals + appendCrudAudit + a success return carrying the blank line id. A lost
 * line write could therefore commit a header-only TONU invoice and a false success audit.
 * Root-caused live: apps/backend/src/dispatch/cancellation-tonu-invoice.ts's line INSERT had no
 * check mirroring the header INSERT's own pattern immediately above it. Fixed by adding the
 * identical check, throwing inside the same transaction so the whole TONU invoice rolls back
 * instead of committing header-only. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-tonu-invoice-line-zero-rows-check.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/cancellation-tonu-invoice.ts",
};
const LABEL = "verify-tonu-invoice-line-zero-rows-check";

export function audit(src) {
  const failures = [];
  const block = src.service.match(
    /const invoiceLineId = String\(lineRes\.rows\[0\]\?\.id \?\? ""\);[\s\S]*?await recomputeInvoiceTotals\(client, invoiceId\);/,
  );
  if (!block) {
    failures.push(`${FILES.service}: invoiceLineId assignment + recomputeInvoiceTotals call not found`);
    return failures;
  }
  const body = block[0];
  if (!/if \(!invoiceLineId\) \{\s*\n\s*throw Object\.assign\(new Error\("tonu_invoice_line_create_failed"\), \{ code: "tonu_invoice_line_create_failed" \}\);\s*\n\s*\}/.test(body)) {
    failures.push(
      `${FILES.service}: a lost invoice_lines write must throw before recomputeInvoiceTotals/audit/success — ` +
        `otherwise a header-only TONU invoice can commit with a false success audit`,
    );
  }
  // Order matters: the check must run BEFORE recomputeInvoiceTotals.
  const checkIdx = body.indexOf('throw Object.assign(new Error("tonu_invoice_line_create_failed")');
  const recomputeIdx = body.indexOf("await recomputeInvoiceTotals(client, invoiceId);");
  if (checkIdx === -1 || recomputeIdx === -1 || checkIdx > recomputeIdx) {
    failures.push(`${FILES.service}: the zero-row check must run BEFORE recomputeInvoiceTotals is called`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    service: good.service.replace(
      `  // DSP-MONEY-F7196 (CC-1): mirror the invoice header's own zero-rows check above — a lost/suppressed
  // invoice_lines write must not silently continue into totals recompute + audit + success carrying a
  // blank line id. Throw inside this same transaction so the whole TONU invoice rolls back rather than
  // committing a header-only invoice with no line.
  if (!invoiceLineId) {
    throw Object.assign(new Error("tonu_invoice_line_create_failed"), { code: "tonu_invoice_line_create_failed" });
  }

`,
      "",
    ),
  };
  if (mutated.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — check-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — check removal escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — TONU invoice-line create fails closed on a zero-row insert`);
