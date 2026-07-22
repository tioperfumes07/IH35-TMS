#!/usr/bin/env node
/**
 * Owner GO 2026-07-22: CC bill-payment submit + nested account create are UNGATED
 * for all operating companies. This guard fails if either frontend const flips back to true.
 *
 * Companion: docs/trackers/OWNER-GO-FINANCIAL-GATES-2026-07-22.md
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const cc = read("apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx");
if (!/const CC_BILL_PAYMENT_GATED\s*=\s*false/.test(cc)) {
  failures.push(
    "CCPaymentModal.tsx: CC_BILL_PAYMENT_GATED must be false (owner GO 2026-07-22 — all companies)"
  );
}

const acct = read("apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx");
if (!/const ACCOUNT_CREATE_GATED\s*=\s*false/.test(acct)) {
  failures.push(
    "NewAccountDrawerForm.tsx: ACCOUNT_CREATE_GATED must be false (owner GO 2026-07-22 — all companies)"
  );
}

if (failures.length) {
  console.error("FAIL verify-owner-financial-gates-ungated:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS verify-owner-financial-gates-ungated — CC bill pay + account create ungated");
