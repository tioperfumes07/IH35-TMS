#!/usr/bin/env node
/**
 * ROUND 285.4.10 / #60 — BOL → invoice → Faro auto-wire must stay wired.
 * Fails if delivery latch drops autoInvoiceOnBol, docs upload drops the retry hook,
 * the awaiting-bol-invoice route is unregistered, or the FE queue page / subnav / route is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-auto-invoice-on-bol-wired";

function mustContain(rel, needles) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`${LABEL} FAIL: missing ${rel}`);
    process.exit(1);
  }
  const src = readFileSync(abs, "utf8");
  for (const n of needles) {
    if (!src.includes(n)) {
      console.error(`${LABEL} FAIL: ${rel} missing ${JSON.stringify(n)}`);
      process.exit(1);
    }
  }
}

mustContain("apps/backend/src/accounting/auto-invoice-on-bol.service.ts", [
  "awaiting_bol",
  "accounting.invoice.awaiting_bol",
  "listLoadsAwaitingBolInvoice",
  "buildInvoiceFromLoad",
  // ROUND 285.4.10 evolved to bol+pod evidence via ANY($2); keep "bol" + the ANY predicate wired.
  "BILLING_EVIDENCE_DOC_CODES",
  'dfc.code = ANY($2::text[])',
  '"bol"',
]);

mustContain("apps/backend/src/dispatch/delivery-evidence-latch.ts", [
  "autoInvoiceOnBol",
  'from "../accounting/auto-invoice-on-bol.service.js"',
]);

mustContain("apps/backend/src/docs/files.routes.ts", [
  "maybe-fire-auto-invoice-after-bol.js",
  "maybeFireAutoInvoiceAfterBolSaved",
]);

mustContain("apps/backend/src/docs/maybe-fire-auto-invoice-after-bol.ts", [
  "autoInvoiceOnBol",
  "autoSubmitDeliveredLoadToFactor",
  // Evidence gate is now bol+pod via BILLING_EVIDENCE_DOC_CODES.includes(category_code).
  "BILLING_EVIDENCE_DOC_CODES",
  "category_code",
]);

mustContain("apps/backend/src/dispatch/awaiting-bol-invoice.routes.ts", [
  "/api/v1/dispatch/awaiting-bol-invoice",
  "listLoadsAwaitingBolInvoice",
  'waiting_for: "BOL"',
]);

mustContain("apps/backend/src/index.ts", ["registerAwaitingBolInvoiceRoutes"]);

mustContain("apps/frontend/src/api/dispatch.ts", [
  "listAwaitingBolInvoice",
  "/api/v1/dispatch/awaiting-bol-invoice",
  'waiting_for: "BOL"',
]);

mustContain("apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx", [
  "listAwaitingBolInvoice",
  "awaiting-bol-invoice-page",
  "awaiting-bol-invoice-table",
]);

mustContain("apps/frontend/src/routes/manifest.tsx", [
  "AwaitingBolInvoicePage",
  "/dispatch/awaiting-bol-invoice",
]);

mustContain("apps/frontend/src/components/dispatch/DispatchSubnav.tsx", [
  "/dispatch/awaiting-bol-invoice",
  "listAwaitingBolInvoice",
  'badgeKey: "awaiting_bol"',
  '"awaiting_bol"',
]);

console.log(`${LABEL} OK`);
process.exit(0);
