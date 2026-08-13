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

const CUSTOMER_CREATORS = [
  "apps/frontend/src/pages/Customers.tsx",
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
];
const CUSTOMER_PAYLOAD_HELPER = "apps/frontend/src/components/customers/CustomerProfileForm.tsx";
const PART_CREATE_DRAWER = "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx";

function read(rel, errors) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`MISSING FILE: ${rel} — the guard cannot verify it. Update this script if the file moved.`);
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

export function auditMasterDataCreateTargets(sources) {
  const errors = [];
  const helper = sources[CUSTOMER_PAYLOAD_HELPER] ?? "";
  const helperCarriesInvoiceEmail =
    /const arEmail = trimOrUndef\(v\.ar_email\) \?\? email/.test(helper) &&
    /const apEmail = trimOrUndef\(v\.ap_email\) \?\? email/.test(helper) &&
    /\bar_email:\s*arEmail/.test(helper) &&
    /\bap_email:\s*apEmail/.test(helper);

  // D1-1: no customer creator may reference the qbo-mirror create fn.
  for (const rel of CUSTOMER_CREATORS) {
    const src = sources[rel] ?? "";
    if (/createQboCustomer/.test(src)) {
      errors.push(
        `D1-1 REGRESSION: ${rel} still references createQboCustomer (writes to the mdata.qbo_customers ` +
          `MIRROR that no picker reads). Customer creators must call createCustomer ` +
          `(POST /api/v1/mdata/customers) so the returned id is a real, bookable mdata.customers FK.`
      );
    }
    if (!/createCustomer\s*\(/.test(src)) {
      errors.push(
        `D1-1 REGRESSION: ${rel} no longer calls createCustomer(...). The customer create must ` +
          `target the real mdata.customers endpoint.`
      );
    }
    // LV-CUSTOMER-CREATE-INVOICE-EMAIL (Cascade #9): invoice-send COALESCE is
    // ap_email → billing_email → ar_email. Follow direct payloads or the shared helper.
    const composesHelper = /createCustomer\(profileValuesToCreatePayload\(/.test(src);
    const carriesDirectly = /\bar_email\s*:/.test(src) && /\bap_email\s*:/.test(src);
    if (!(carriesDirectly || (composesHelper && helperCarriesInvoiceEmail))) {
      errors.push(
        `LV-CUSTOMER-CREATE-INVOICE-EMAIL: ${rel} createCustomer(...) must pass ar_email and ap_email ` +
          `(same value as email) so invoice send can resolve a recipient without a CustomerDetail edit.`
      );
    }
  }

  // D5-1: PartCreateDrawer must not use a raw fetch(resolveApiUrl(...)) for its mutation.
  const partSrc = sources[PART_CREATE_DRAWER] ?? "";
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
  return errors;
}

const FILES = [...CUSTOMER_CREATORS, CUSTOMER_PAYLOAD_HELPER, PART_CREATE_DRAWER];
const readErrors = [];
const sources = Object.fromEntries(FILES.map((rel) => [rel, read(rel, readErrors) ?? ""]));
const errors = [...readErrors, ...auditMasterDataCreateTargets(sources)];

if (process.argv.includes("--selftest")) {
  if (errors.length) {
    console.error(`verify-master-data-create-targets SELFTEST FAIL — live tree red:\n${errors.join("\n")}`);
    process.exit(1);
  }
  const cases = [
    ["shared invoice email removed", CUSTOMER_PAYLOAD_HELPER, /\bap_email:\s*apEmail/, "ap_email"],
    ["quick create targets mirror", CUSTOMER_CREATORS[2], /createCustomer\s*\(/, "createQboCustomer("],
    ["part create bypasses helper", PART_CREATE_DRAWER, /apiRequest\s*[<(]/, "fetch(resolveApiUrl("],
  ];
  for (const [name, rel, find, replacement] of cases) {
    const mutated = { ...sources, [rel]: sources[rel].replace(find, replacement) };
    if (mutated[rel] === sources[rel] || auditMasterDataCreateTargets(mutated).length === 0) {
      console.error(`verify-master-data-create-targets SELFTEST FAIL — ${name} escaped`);
      process.exit(1);
    }
  }
  console.log(`verify-master-data-create-targets SELFTEST PASS — ${cases.length} planted creator defects caught`);
  process.exit(0);
}

if (errors.length > 0) {
  console.error("verify-master-data-create-targets: FAIL\n");
  for (const e of errors) console.error("  ✗ " + e + "\n");
  process.exit(1);
}

console.log("verify-master-data-create-targets: OK — all customer creators target mdata.customers with invoice email; PartCreateDrawer uses apiRequest.");
