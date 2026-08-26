#!/usr/bin/env node
/**
 * CUSTOMER-EMAIL-REQUIRED
 *
 * Ensures customer create + edit paths require email on both client and server,
 * so invoice-send has a deliverable address without opening CustomerDetail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  { rel: "apps/frontend/src/components/customers/CustomerProfileForm.tsx", checks: [
      /<TextField[^\n]*?label="Email"[^\n]*?required[^\n]*?\/>/, // TextField "Email" is marked required
    ] },
  { rel: "apps/frontend/src/pages/Customers.tsx", checks: [
      /email_required/,
      /createFieldErrors\.email/,
      /Email is required/,
    ] },
  { rel: "apps/frontend/src/components/customers/CustomerEditModal.tsx", checks: [
      /Email is required/,
      /!values\.email\.trim\(\)/,
    ] },
  { rel: "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx", checks: [
      /Email is required/,
      /validateCustomerProfileForCreate\(values\)/,
      /profileValuesToCreatePayload\(values, operatingCompanyId\)/,
    ] },
  { rel: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx", checks: [
      /kind === "customer"/,
      /<NewCustomerDrawerForm/,
    ] },
  { rel: "apps/backend/src/mdata/customers.routes.ts", checks: [
      /email:\s*z\.string\(\)\.email\(\)\.min\(1\)/,
    ] },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkTree() {
  for (const t of TARGETS) {
    const abs = path.join(ROOT, t.rel);
    assert(fs.existsSync(abs), `MISSING FILE: ${t.rel}`);
    const src = fs.readFileSync(abs, "utf8");
    for (const c of t.checks) {
      assert(c.test(src), `${t.rel} must match ${c}`);
    }
  }
}

function selftest() {
  const badBackend = `  email: z.string().email().transform((v) => v.toLowerCase()).optional(),`;
  const goodBackend = `  email: z.string().email().min(1).transform((v) => v.toLowerCase()),`;
  let failed = false;
  try {
    assert(/email:\s*z\.string\(\)\.email\(\)\.min\(1\)/.test(badBackend), "selftest: bad backend must not match");
  } catch {
    failed = true;
  }
  assert(failed, "selftest: bad backend must FAIL");
  assert(/email:\s*z\.string\(\)\.email\(\)\.min\(1\)/.test(goodBackend), "selftest: good backend must match");
  console.log("verify-customer-email-required --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkTree();
  console.log("verify-customer-email-required PASS — customer email is required across create/edit/inline paths");
}
