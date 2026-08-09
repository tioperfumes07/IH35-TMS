#!/usr/bin/env node
/**
 * Static guard: from-load invoices must refuse $0 creation and unsent invoices
 * (draft/proforma) must re-sync to the load's rate_total_cents when it changes.
 * Prevents INV-2026-00021/00027 class stuck-$0 invoices.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromLoad = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/from-load.ts"), "utf8");
const updateLoad = fs.readFileSync(path.join(ROOT, "apps/backend/src/dispatch/update-load.service.ts"), "utf8");
const errors = [];

if (!/rateCents\s*<=\s*0/.test(fromLoad) || !/load_has_no_rate/.test(fromLoad)) {
  errors.push("from-load.ts does not refuse to mint a $0 invoice (rate_total_cents <= 0)");
}
if (!/rate_total_cents\s*\?\?\s*0/.test(fromLoad) || !/line_total_cents/.test(fromLoad)) {
  errors.push("from-load.ts does not derive the invoice line from load.rate_total_cents");
}

if (!/i\.status\s*IN\s*\(\s*['"]draft['"]\s*,\s*['"]proforma['"]\s*\)/.test(updateLoad) &&
    !/i\.status\s*IN\s*\(\s*['"]proforma['"]\s*,\s*['"]draft['"]\s*\)/.test(updateLoad)) {
  errors.push("update-load.service.ts does not re-sync BOTH draft and proforma from-load invoices on rate change");
}
if (!/unit_amount_cents\s*=\s*\$3::bigint/.test(updateLoad) || !/line_total_cents\s*=\s*\$3::bigint/.test(updateLoad)) {
  errors.push("update-load.service.ts resync does not set unit_amount_cents and line_total_cents");
}
if (!/recomputeInvoiceTotals\(client, String\(row\.invoice_id\)\)/.test(updateLoad)) {
  errors.push("update-load.service.ts resync does not recompute invoice totals");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: from-load rate resync guards wired");
process.exit(0);
