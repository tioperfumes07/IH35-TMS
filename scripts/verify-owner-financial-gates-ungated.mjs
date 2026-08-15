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

const newForm = read("apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx");
const drawer = read("apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx");
const embedsDrawer =
  /<AccountDrawer[\s>]/.test(newForm) &&
  (/from ["'].*AccountDrawer["']|from ["'].*\/AccountDrawer["']/.test(newForm) ||
    /import\s*\{\s*AccountDrawer\s*\}/.test(newForm));

if (embedsDrawer) {
  if (/ACCOUNT_CREATE_GATED\s*=\s*true/.test(drawer)) {
    failures.push("AccountDrawer.tsx: ACCOUNT_CREATE_GATED must not be true (embedded nested create path)");
  }
  if (/ACCOUNT_CREATE_GATED\s*=\s*true/.test(newForm)) {
    failures.push("NewAccountDrawerForm.tsx: ACCOUNT_CREATE_GATED must not be true");
  }
} else if (!/const ACCOUNT_CREATE_GATED\s*=\s*false/.test(newForm)) {
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
