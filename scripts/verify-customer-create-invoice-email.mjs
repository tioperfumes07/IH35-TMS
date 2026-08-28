#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["customer","connectivity"],"leafRe":"^(list\\.|detail\\.|md\\.)","task":"P43","pr":"#5913"} */
/**
 * LV-CUSTOMER-CREATE-INVOICE-EMAIL (Cascade create-sweep #9 / DESK-REF)
 *
 * invoice-send.service resolves recipient via:
 *   ap_email → billing_email → ar_email → ar_email_snapshot
 * Backend maps CreateCustomerInput.email → billing_email, but inline creators must
 * also stamp ar_email / ap_email (via profileValuesToCreatePayload fallback or explicit keys).
 *
 * Inline customer create must use the canonical CustomerProfileForm + shared payload helper.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PROFILE = "apps/frontend/src/components/customers/CustomerProfileForm.tsx";
const DRAWER = "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx";
const QUICK = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const BACKEND = "apps/backend/src/mdata/customers.routes.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkQuickCreateSource(rel, src) {
  if (/NewCustomerDrawerForm/.test(src)) {
    assert(/kind === "customer"[\s\S]{0,500}<NewCustomerDrawerForm/.test(src), `${rel}: customer quick create must delegate to NewCustomerDrawerForm`);
    assert(!/createQboCustomer/.test(src), `${rel}: must not call createQboCustomer`);
    return;
  }
  assert(/createCustomer\s*\(/.test(src), `${rel}: must call createCustomer(...)`);
  assert(!/createQboCustomer/.test(src), `${rel}: must not call createQboCustomer`);
  assert(/\bar_email\s*:/.test(src), `${rel}: createCustomer must pass ar_email`);
  assert(/\bap_email\s*:/.test(src), `${rel}: createCustomer must pass ap_email`);
  assert(
    /ar_email:\s*invoiceEmail|ar_email:\s*[a-zA-Z_][\w.]*/.test(src),
    `${rel}: ar_email must be bound to a variable (same value as email)`
  );
}

function checkTree() {
  const profilePath = path.join(ROOT, PROFILE);
  const drawerPath = path.join(ROOT, DRAWER);
  const quickPath = path.join(ROOT, QUICK);
  const backendPath = path.join(ROOT, BACKEND);
  assert(fs.existsSync(profilePath), `MISSING FILE: ${PROFILE}`);
  assert(fs.existsSync(drawerPath), `MISSING FILE: ${DRAWER}`);
  assert(fs.existsSync(quickPath), `MISSING FILE: ${QUICK}`);
  assert(fs.existsSync(backendPath), `MISSING FILE: ${BACKEND}`);

  const profile = fs.readFileSync(profilePath, "utf8");
  const drawer = fs.readFileSync(drawerPath, "utf8");
  const quick = fs.readFileSync(quickPath, "utf8");
  const backend = fs.readFileSync(backendPath, "utf8");

  assert(/validateCustomerProfileForCreate/.test(profile), `${PROFILE}: must export validateCustomerProfileForCreate`);
  assert(/label="Email"[\s\S]{0,120}required/.test(profile), `${PROFILE}: Email field must be required`);
  assert(
    /ar_email:\s*arEmail|const arEmail = trimOrUndef\(v\.ar_email\) \?\? email/.test(profile),
    `${PROFILE}: profileValuesToCreatePayload must fall back ar_email from email`
  );
  assert(
    /ap_email:\s*apEmail|const apEmail = trimOrUndef\(v\.ap_email\) \?\? email/.test(profile),
    `${PROFILE}: profileValuesToCreatePayload must fall back ap_email from email`
  );

  assert(/<CustomerProfileForm\s/.test(drawer), `${DRAWER}: must render CustomerProfileForm`);
  assert(/profileValuesToCreatePayload/.test(drawer), `${DRAWER}: must submit via profileValuesToCreatePayload`);
  assert(/createCustomer\s*\(/.test(drawer), `${DRAWER}: must call createCustomer(...)`);
  assert(!/createQboCustomer/.test(drawer), `${DRAWER}: must not call createQboCustomer`);

  // P43: billing locality must survive both create surfaces and edit/reload. The DB columns existed,
  // but omitting them from the API contract made the fields structurally unwritable.
  for (const field of ["billing_city", "billing_zip"]) {
    const createNormalizer = field === "billing_city" ? "properOrUndef" : "trimOrUndef";
    const updateNormalizer = field === "billing_city" ? "properOrNull" : "trimOrNull";
    assert(new RegExp(`${field}:\\s*${createNormalizer}\\(v\\.${field}\\)`).test(profile), `${PROFILE}: create payload must carry ${field}`);
    assert(new RegExp(`${field}:\\s*${updateNormalizer}\\(v\\.${field}\\)`).test(profile), `${PROFILE}: update payload must carry ${field}`);
    assert(new RegExp(`${field}:\\s*z\\.string`).test(backend), `${BACKEND}: schemas must accept ${field}`);
  }
  assert(/addOptional\("billing_city", b\.billing_city\)/.test(backend), `${BACKEND}: create must persist billing_city`);
  assert(/addOptional\("billing_postal_code", b\.billing_zip\)/.test(backend), `${BACKEND}: create must persist billing_zip`);
  assert(/billing_postal_code AS billing_zip/.test(backend), `${BACKEND}: reload must return billing_zip`);

  const mdataApi = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/mdata.ts"), "utf8");
  for (const field of ["billing_city", "billing_zip"]) {
    assert(new RegExp(`${field}\\?:\\s*string \\| null`).test(mdataApi), `mdata.ts Customer type must declare ${field}`);
  }

  const dispatchApi = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/dispatch.ts"), "utf8");
  assert(
    /catalog_load_type_id\?:\s*string/.test(dispatchApi),
    "dispatch.ts DispatchBookLoadPayload must declare catalog_load_type_id (Render web tsc)"
  );

  checkQuickCreateSource(QUICK, quick);
}

function selftest() {
  const goodProfile = `
    export function validateCustomerProfileForCreate() {}
    <TextField label="Email" type="email" required />
    const arEmail = trimOrUndef(v.ar_email) ?? email;
    const apEmail = trimOrUndef(v.ap_email) ?? email;
    ar_email: arEmail,
    ap_email: apEmail,
  `;
  const goodDrawer = `
    <CustomerProfileForm values={values} />
    await createCustomer(profileValuesToCreatePayload(values, operatingCompanyId));
  `;
  const goodQuick = `
    const invoiceEmail = form.email.trim() || undefined;
    await createCustomer({
      name: displayName,
      email: invoiceEmail,
      ar_email: invoiceEmail,
      ap_email: invoiceEmail,
    });
  `;
  const badMissingAr = `
    await createCustomer({
      name: displayName,
      email: invoiceEmail,
      ap_email: invoiceEmail,
    });
  `;
  let failed = false;
  try {
    checkQuickCreateSource("selftest-bad", badMissingAr);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: missing ar_email must FAIL");
  assert(/validateCustomerProfileForCreate/.test(goodProfile), "selftest profile");
  assert(/<CustomerProfileForm\s/.test(goodDrawer), "selftest drawer");
  checkQuickCreateSource("selftest-good", goodQuick);
  console.log("verify-customer-create-invoice-email --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkTree();
  console.log(
    "verify-customer-create-invoice-email PASS — canonical customer create + invoice email stamps"
  );
}
