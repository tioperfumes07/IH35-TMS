#!/usr/bin/env node
// Guard: bank-statement CSV import must map money direction correctly.
// Convention (bank-feed-gl-posting.service.ts): is_credit=true = money IN, false = money OUT.
// Single-"amount"-column bank CSVs (Wells Fargo) export withdrawals NEGATIVE, deposits POSITIVE,
// so money-in is `cents > 0`. A prior bug used `cents < 0`, inverting every transaction and
// corrupting reconciliation. This guard prevents that regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const f = "apps/backend/src/banking/reconciliation.routes.ts";
const src = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, f), "utf8");
  } catch {
    return "";
  }
})();

const errs = [];
if (!src) {
  errs.push(`${f} not found`);
} else {
  // The inverted form must never come back.
  if (/is_credit:\s*cents\s*<\s*0/.test(src)) {
    errs.push("CSV import maps `is_credit: cents < 0` — inverted; withdrawals become money-in. Use `cents > 0`.");
  }
  // The correct form must be present in the manual-upload insert.
  if (!/is_credit:\s*cents\s*>\s*0/.test(src)) {
    errs.push("CSV import must set `is_credit: cents > 0` (positive amount = deposit = money in).");
  }
}

if (errs.length) {
  console.error("[verify-csv-import-direction] FAILED");
  for (const e of errs) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("[verify-csv-import-direction] OK");
