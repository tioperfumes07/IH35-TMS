#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const VENDOR_EDIT_DRAWER = "apps/frontend/src/components/vendors/VendorEditDrawer.tsx";
const VENDOR_CREATE_MODAL = "apps/frontend/src/components/vendors/VendorCreateModal.tsx";
const BACKFILL_SCRIPT = "scripts/backfill-vendor-default-expense-account.ts";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function verify() {
  const errors = [];

  // 1. VendorEditDrawer must have the default-expense-account prompt
  const editSource = fs.readFileSync(path.join(ROOT, VENDOR_EDIT_DRAWER), "utf8");
  if (!editSource.includes('data-testid="vendor-default-expense-account-prompt"')) {
    errors.push("VendorEditDrawer must include the default-expense-account prompt (data-testid=\"vendor-default-expense-account-prompt\")");
  }
  if (!editSource.includes("default_expense_account_id: values.defaultExpenseAccountId")) {
    errors.push("VendorEditDrawer must send default_expense_account_id in the PATCH payload");
  }

  // 2. VendorCreateModal must have the default-expense-account field
  const createSource = fs.readFileSync(path.join(ROOT, VENDOR_CREATE_MODAL), "utf8");
  if (!createSource.includes('data-testid="vendor-create-default-expense-account"')) {
    errors.push("VendorCreateModal must include the default-expense-account field");
  }
  if (!createSource.includes("default_expense_account_id: defaultExpenseAccountId")) {
    errors.push("VendorCreateModal must send default_expense_account_id in the POST payload");
  }

  // 3. Backfill script must exist and be idempotent
  if (!fs.existsSync(path.join(ROOT, BACKFILL_SCRIPT))) {
    errors.push("backfill-vendor-default-expense-account.ts script must exist");
  } else {
    const backfillSource = fs.readFileSync(path.join(ROOT, BACKFILL_SCRIPT), "utf8");
    if (!backfillSource.includes("default_expense_account_id IS NULL")) {
      errors.push("backfill script must be idempotent (only update rows where default_expense_account_id IS NULL)");
    }
    if (!backfillSource.includes("driver_pay_expense")) {
      errors.push("backfill script must map Driver vendors to driver_pay_expense role");
    }
    if (!backfillSource.includes("insurance_expense")) {
      errors.push("backfill script must map Insurance vendors to insurance_expense role");
    }
    if (!backfillSource.includes("uncategorized_expense")) {
      errors.push("backfill script must map Other vendors to uncategorized_expense fallback role");
    }
    if (!backfillSource.includes(USMCA_COMPANY_ID)) {
      errors.push("backfill script must be USMCA-scoped");
    }
  }

  return errors;
}


if (process.argv.includes("--selftest")) {
  const clean = verify();
  if (clean.length) {
    console.error(`SELFTEST setup failed: ${clean.join("; ")}`);
    process.exit(1);
  }
  // Plant a missing prompt
  const original = fs.readFileSync(path.join(ROOT, VENDOR_EDIT_DRAWER), "utf8");
  const planted = original.replace('data-testid="vendor-default-expense-account-prompt"', 'data-testid="planted-removed"');
  const tmpPath = VENDOR_EDIT_DRAWER + ".selftest-tmp";
  fs.writeFileSync(tmpPath, planted);
  fs.renameSync(tmpPath, VENDOR_EDIT_DRAWER);
  const errors = verify();
  // Restore
  fs.writeFileSync(VENDOR_EDIT_DRAWER, original);
  if (!errors.some((e) => e.includes("vendor-default-expense-account-prompt"))) {
    console.error("SELFTEST FAIL: planted missing prompt was not detected");
    process.exit(1);
  }
  console.log("SELFTEST PASS: 1/1 planted missing-prompt regression detected");
  process.exit(0);
}

const errors = verify();
if (errors.length) {
  console.error("verify-vendor-default-expense-account.mjs FAIL:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("verify-vendor-default-expense-account.mjs PASS");
