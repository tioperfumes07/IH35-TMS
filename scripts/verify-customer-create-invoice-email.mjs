#!/usr/bin/env node
/**
 * LV-CUSTOMER-CREATE-INVOICE-EMAIL (Cascade create-sweep #9 / DESK-REF)
 *
 * invoice-send.service resolves recipient via:
 *   ap_email → billing_email → ar_email → ar_email_snapshot
 * Backend maps CreateCustomerInput.email → billing_email, but the inline create
 * drawers historically only passed `email` + `main_contact_email` — never
 * ar_email / ap_email. Live consequence: ar_email = 0 of 2705 customers; 63
 * customers with open invoices have no email in any field ($284,809.01).
 *
 * Fix: NewCustomerDrawerForm + QuickCreateEntityModal stamp ar_email + ap_email
 * from the same invoice email value so a quick-created customer is deliverable
 * without opening CustomerDetail.
 *
 * This guard FAIL-closes if either creator drops those keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkSource(rel, src) {
  assert(/createCustomer\s*\(/.test(src), `${rel}: must call createCustomer(...)`);
  assert(!/createQboCustomer/.test(src), `${rel}: must not call createQboCustomer`);
  assert(/\bar_email\s*:/.test(src), `${rel}: createCustomer must pass ar_email`);
  assert(/\bap_email\s*:/.test(src), `${rel}: createCustomer must pass ap_email`);
  // Prefer sharing one invoiceEmail / email binding into both keys (not hardcode empty).
  assert(
    /ar_email:\s*invoiceEmail|ar_email:\s*[a-zA-Z_][\w.]*/.test(src),
    `${rel}: ar_email must be bound to a variable (same value as email)`
  );
}

function checkTree() {
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    assert(fs.existsSync(abs), `MISSING FILE: ${rel}`);
    checkSource(rel, fs.readFileSync(abs, "utf8"));
  }
}

function selftest() {
  const good = `
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
    checkSource("selftest-bad", badMissingAr);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: missing ar_email must FAIL");
  checkSource("selftest-good", good);
  console.log("verify-customer-create-invoice-email --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkTree();
  console.log(
    "verify-customer-create-invoice-email PASS — inline creators stamp ar_email + ap_email for invoice-send"
  );
}
