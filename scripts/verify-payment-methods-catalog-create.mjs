#!/usr/bin/env node
/**
 * Rule-17 guard: payment methods catalog GL picker uses ReferenceSelect +Create account.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payment-methods-catalog-create";
const PAGE = "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertPaymentMethodsCatalogCreate() {
  const errors = [];
  const page = read(PAGE);

  if (/\bCombobox\b/.test(page)) {
    errors.push(`${PAGE}: must not use bare Combobox for GL account — use ReferenceSelect createKind=account`);
  }
  if (!page.includes("ReferenceSelect") || !page.includes('createKind="account"')) {
    errors.push(`${PAGE}: GL account picker must use ReferenceSelect createKind=account (+ Create)`);
  }
  if (!page.includes("+ Create")) {
    errors.push(`${PAGE}: page actions must expose + Create for payment methods`);
  }
  return errors;
}

function selftest() {
  const errors = assertPaymentMethodsCatalogCreate();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPaymentMethodsCatalogCreate();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
