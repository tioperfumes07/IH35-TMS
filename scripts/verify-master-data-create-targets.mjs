#!/usr/bin/env node
/**
 * verify-master-data-create-targets.mjs
 *
 * CI guard for the master-data "black-hole" fixes (audit findings D1-1 + D5-1) plus
 * LV-CUSTOMER-CREATE-INVOICE-EMAIL (Cascade create-sweep #9):
 *
 *  D1-1 — the inline customer creators (New Customer drawer + Quick Create modal) must write to the
 *         REAL mdata.customers table via createCustomer (POST /api/v1/mdata/customers), NOT to the
 *         QBO mirror table (mdata.qbo_customers via createQboCustomer) that no customer picker/search/
 *         list reads. A customer created against the mirror never appears anywhere and returns a
 *         dangling, un-bookable, un-invoiceable id.
 *
 *  LV-CUSTOMER-CREATE-INVOICE-EMAIL — createCustomer must also stamp ar_email + ap_email (invoice-send
 *         COALESCE order) so quick-created customers are email-deliverable without CustomerDetail.
 *
 *  D5-1 — PartCreateDrawer must submit through the shared apiRequest helper (which adds
 *         credentials:"include" + Idempotency-Key + base URL), NOT a raw fetch(resolveApiUrl(...))
 *         which drops the session cookie cross-origin and 401s in prod.
 *
 * Fails (exit 1) with a descriptive message if any target regresses.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const INLINE_CUSTOMER_CREATORS = [
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
];
const PART_CREATE_DRAWER = "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx";

const errors = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`MISSING FILE: ${rel} — the guard cannot verify it. Update this script if the file moved.`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

// D1-1: neither inline customer creator may reference the qbo-mirror create fn.
for (const rel of INLINE_CUSTOMER_CREATORS) {
  const src = read(rel);
  if (src == null) continue;
  if (/createQboCustomer/.test(src)) {
    errors.push(
      `D1-1 REGRESSION: ${rel} still references createQboCustomer (writes to the mdata.qbo_customers ` +
        `MIRROR that no picker reads). Inline customer creators must call createCustomer ` +
        `(POST /api/v1/mdata/customers) so the returned id is a real, bookable mdata.customers FK.`
    );
  }
  if (!/createCustomer\s*\(/.test(src)) {
    errors.push(
      `D1-1 REGRESSION: ${rel} no longer calls createCustomer(...). The inline customer create must ` +
        `target the real mdata.customers endpoint.`
    );
  }
  // LV-CUSTOMER-CREATE-INVOICE-EMAIL (Cascade #9): invoice-send COALESCE is
  // ap_email → billing_email → ar_email. `email` maps to billing_email on the API, but
  // ar_email/ap_email were never stamped from the create drawer — so quick-created customers
  // were undeliverable until someone edited CustomerDetail. Require both keys on createCustomer.
  if (!/\bar_email\s*:/.test(src) || !/\bap_email\s*:/.test(src)) {
    errors.push(
      `LV-CUSTOMER-CREATE-INVOICE-EMAIL: ${rel} createCustomer(...) must pass ar_email and ap_email ` +
        `(same value as email) so invoice send can resolve a recipient without a CustomerDetail edit.`
    );
  }
}

// D5-1: PartCreateDrawer must not use a raw fetch(resolveApiUrl(...)) for its mutation.
const partSrc = read(PART_CREATE_DRAWER);
if (partSrc != null) {
  if (/fetch\s*\(\s*resolveApiUrl/.test(partSrc)) {
    errors.push(
      `D5-1 REGRESSION: ${PART_CREATE_DRAWER} uses a raw fetch(resolveApiUrl(...)) which omits ` +
        `credentials:"include" → the cross-origin prod API drops the session cookie → 401 before ` +
        `parse ("Failed to create part"). Route the create through the shared apiRequest helper.`
    );
  }
  if (!/apiRequest\s*[<(]/.test(partSrc)) {
    errors.push(
      `D5-1 REGRESSION: ${PART_CREATE_DRAWER} no longer calls apiRequest(...). The part create must go ` +
        `through the shared helper (credentials + idempotency + base URL).`
    );
  }
}

if (errors.length > 0) {
  console.error("verify-master-data-create-targets: FAIL\n");
  for (const e of errors) console.error("  ✗ " + e + "\n");
  process.exit(1);
}

console.log("verify-master-data-create-targets: OK — inline customer creators target mdata.customers; PartCreateDrawer uses apiRequest.");
