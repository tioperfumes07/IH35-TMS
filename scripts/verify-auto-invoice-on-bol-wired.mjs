#!/usr/bin/env node
/**
 * ROUND 285.4.10 / #60 — BOL → invoice → Faro auto-wire must stay wired.
 * Fails if delivery latch drops autoInvoiceOnBol, docs upload drops the retry hook,
 * or the awaiting-bol-invoice route is unregistered.
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
  "dfc.code = 'bol'",
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
  'category_code !== "bol"',
]);

mustContain("apps/backend/src/dispatch/awaiting-bol-invoice.routes.ts", [
  "/api/v1/dispatch/awaiting-bol-invoice",
  "listLoadsAwaitingBolInvoice",
  'waiting_for: "BOL"',
]);

mustContain("apps/backend/src/index.ts", ["registerAwaitingBolInvoiceRoutes"]);

console.log(`${LABEL} OK`);
process.exit(0);
