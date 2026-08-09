#!/usr/bin/env node
/**
 * Static guard: A/R aging must exclude proforma (and draft/void) invoices.
 * Proformas post no journal entry and are not customer receivables.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arAging = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/ar-aging.service.ts"), "utf8");
const errors = [];

if (!/i\.status\s+NOT\s+IN\s*\([^)]*['"]proforma['"]/.test(arAging)) {
  errors.push("ar-aging.service.ts does not exclude 'proforma' status");
}
if (!/['"]draft['"]/.test(arAging)) {
  errors.push("ar-aging.service.ts does not exclude 'draft' status");
}
if (!/['"]void['"]/.test(arAging)) {
  errors.push("ar-aging.service.ts does not exclude 'void' status");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: A/R aging excludes proforma/draft/void invoices");
process.exit(0);
