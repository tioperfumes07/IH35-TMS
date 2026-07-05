#!/usr/bin/env node
/**
 * verify-cash-flow-void-exclusion.mjs  (CASH-1 — permanent guard)
 *
 * The canonical void write-path (apps/backend/src/accounting/bills.service.ts
 * voidBill / voidBillPayment) stores `status = 'void'` (SINGULAR) and sets
 * `revoked_at = now()` — it NEVER writes `'voided'`. So the old cash-flow filters
 * `status <> 'voided'` / `NOT IN ('paid','voided')` were NO-OPS: voided bills and
 * bill-payments leaked into the cash-flow figures.
 *
 * This guard fails if apps/backend/src/cash-flow/cash-flow.service.ts reintroduces
 * a bare-'voided' exclusion that omits the singular 'void' (the real stored value),
 * and it requires the shared notVoidedSql() helper to keep matching both 'void'
 * and 'voided' plus `revoked_at IS NULL` (mirroring the authoritative reader in
 * bills.service.ts listBills).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const src = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, FILE), "utf8");
  } catch {
    return "";
  }
})();

const errs = [];

if (!src) {
  errs.push(`${FILE} not found`);
} else {
  // (1) The shared helper must exist and cover 'void', 'voided', and revoked_at.
  // Capture from the declaration to the function-closing brace at column 0 (the body
  // contains `${alias}` braces, so a non-greedy `}` match would truncate early).
  const helper = src.match(/export function notVoidedSql\([^)]*\)\s*:\s*string\s*\{[\s\S]*?\n\}/);
  if (!helper) {
    errs.push("notVoidedSql(alias) helper is missing — the void-exclusion predicate must be centralized.");
  } else {
    const h = helper[0];
    if (!h.includes("'void'")) errs.push("notVoidedSql must exclude the SINGULAR 'void' (the value the write-path stores).");
    if (!h.includes("'voided'")) errs.push("notVoidedSql must also exclude legacy 'voided' status.");
    if (!/revoked_at\s+IS\s+NULL/i.test(h)) errs.push("notVoidedSql must also exclude rows carrying revoked_at (revoked_at IS NULL).");
  }

  // (2) No bare `<alias>.status <> 'voided'` / `!= 'voided'` no-op comparisons.
  const bareNe = src.match(/\b\w+\.status\s*(?:<>|!=)\s*'voided'/g);
  if (bareNe) {
    errs.push(`Found no-op void filter(s) that miss the stored 'void' value: ${bareNe.join(", ")} — use notVoidedSql().`);
  }

  // (3) No `NOT IN (...'voided'...)` that omits 'void'.
  const notInMatches = src.match(/status\s+NOT\s+IN\s*\([^)]*\)/gi) || [];
  for (const m of notInMatches) {
    if (m.includes("'voided'") && !m.includes("'void'")) {
      errs.push(`NOT IN filter excludes 'voided' but not the stored 'void': ${m} — use notVoidedSql().`);
    }
  }
}

if (errs.length) {
  console.error("[verify-cash-flow-void-exclusion] FAILED");
  for (const e of errs) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("[verify-cash-flow-void-exclusion] OK — cash-flow excludes voided bills/bill-payments by the real stored value.");
