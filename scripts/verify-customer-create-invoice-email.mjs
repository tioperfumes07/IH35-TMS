#!/usr/bin/env node
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkQuickCreateSource(rel, src) {
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
  assert(fs.existsSync(profilePath), `MISSING FILE: ${PROFILE}`);
  assert(fs.existsSync(drawerPath), `MISSING FILE: ${DRAWER}`);
  assert(fs.existsSync(quickPath), `MISSING FILE: ${QUICK}`);

  const profile = fs.readFileSync(profilePath, "utf8");
  const drawer = fs.readFileSync(drawerPath, "utf8");
  const quick = fs.readFileSync(quickPath, "utf8");

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
