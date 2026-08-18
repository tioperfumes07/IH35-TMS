#!/usr/bin/env node
/**
 * verify-bill-payment-print-letter-html.mjs
 *
 * LV-INBOX-P0-2-INVOICE-BILL-PAYMENT-SETTLEMENT-LETTER-HTML — bill, invoice, and settlement each
 * already had a canonical backend-rendered letter HTML route (wrapPdfDocument, reached via
 * openPrintableDocument's ?print=1 pattern). Bill payment did not — its Print button fell back to
 * printLetterHtml, a client-built, no-brand-header document explicitly documented (in its own
 * header comment) as the fallback for surfaces "WITHOUT A BACKEND .html ROUTE YET". This guard
 * proves the gap is closed with the SAME canonical pattern the other 3 document types use, not a
 * fourth, different mechanism.
 *
 * Guards:
 *  1. apps/backend/src/accounting/bill-payment-render.routes.ts exists, registers
 *     GET /api/v1/accounting/bill-payments/:id.html, uses wrapPdfDocument, and is a
 *     fastify-plugin default export (required for @fastify/autoload to pick it up from the
 *     accounting/ directory — see accounting/index.ts's autoload config).
 *  2. BillPaymentDetailPage.tsx's Print button calls openPrintableDocument against that exact
 *     route, not printLetterHtml (the client-built fallback this fix retires for this surface).
 */
import { readFileSync } from "node:fs";

const failures = [];

const routePath = "apps/backend/src/accounting/bill-payment-render.routes.ts";
let routeSrc = "";
try {
  routeSrc = readFileSync(routePath, "utf8");
} catch {
  failures.push(`${routePath}: file does not exist`);
}
if (routeSrc) {
  if (!/"\/api\/v1\/accounting\/bill-payments\/:id\.html"/.test(routeSrc)) {
    failures.push(`${routePath}: no longer registers GET /api/v1/accounting/bill-payments/:id.html`);
  }
  if (!/wrapPdfDocument/.test(routeSrc)) {
    failures.push(`${routePath}: no longer uses wrapPdfDocument — must render the same canonical letter shell bill/invoice/settlement use`);
  }
  if (!/export default fp\(/.test(routeSrc)) {
    failures.push(`${routePath}: no longer a fastify-plugin default export — @fastify/autoload (accounting/index.ts) will not pick this route up`);
  }
  if (!/getBillPaymentDetail/.test(routeSrc)) {
    failures.push(`${routePath}: no longer reuses getBillPaymentDetail — must not invent a second bill-payment query path`);
  }
}

const pagePath = "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx";
const pageSrc = readFileSync(pagePath, "utf8");
if (!/openPrintableDocument\(\s*\n?\s*`\/api\/v1\/accounting\/bill-payments\/\$\{encodeURIComponent\(id\)\}\.html/.test(pageSrc)) {
  failures.push(`${pagePath}: Print button no longer calls openPrintableDocument against the canonical .html route`);
}
if (/printLetterHtml/.test(pageSrc)) {
  failures.push(`${pagePath}: still references printLetterHtml (the client-built fallback) — must be fully retired for this surface now that a backend route exists`);
}

if (failures.length > 0) {
  console.error("verify-bill-payment-print-letter-html: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-bill-payment-print-letter-html: OK — bill payment now has a canonical wrapPdfDocument letter HTML route (same pattern as bill/invoice/settlement), Print button uses openPrintableDocument, printLetterHtml fully retired for this surface"
);
