#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-r09-bill-subnav-type-contract";
const TYPE_TABS = "apps/frontend/src/components/forms/shared/TypeTabBar.tsx";
const CREATE_BILL = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const VENDOR_FORM = "apps/frontend/src/components/accounting/VendorBillForm.tsx";
const BILLS_TEST = "apps/frontend/src/pages/accounting/BillsPage.test.tsx";
const REQUIRED_TYPES = ["maintenance", "repair", "fuel", "driver"];

export function check({ typeTabs, createBill, vendorForm, billsTest }) {
  const failures = [];
  if (!/export type BillTypeId/.test(typeTabs)) {
    failures.push(`${TYPE_TABS}: must export the closed BillTypeId contract`);
  }
  for (const source of [
    [CREATE_BILL, createBill],
    [VENDOR_FORM, vendorForm],
  ]) {
    if (!/initialBillType\?\s*:\s*BillTypeId/.test(source[1])) {
      failures.push(`${source[0]}: initialBillType must use BillTypeId, not string`);
    }
  }
  if (!/it\.each\(\s*\[\s*["']maintenance["']\s*,\s*["']repair["']\s*,\s*["']fuel["']\s*,\s*["']driver["']\s*\]\s+as const\s*\)/s.test(billsTest)) {
    failures.push(`${BILLS_TEST}: must exercise all four typed bill subnav creators`);
  }
  for (const type of REQUIRED_TYPES) {
    if (!new RegExp(`["']${type}["']`).test(typeTabs)) {
      failures.push(`${TYPE_TABS}: missing ${type} bill type`);
    }
  }
  return failures;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

export function run() {
  return check({
    typeTabs: read(TYPE_TABS),
    createBill: read(CREATE_BILL),
    vendorForm: read(VENDOR_FORM),
    billsTest: read(BILLS_TEST),
  });
}

if (process.argv.includes("--selftest")) {
  const healthy = {
    typeTabs: `export type BillTypeId = "maintenance" | "repair" | "fuel" | "driver";`,
    createBill: `initialBillType?: BillTypeId;`,
    vendorForm: `initialBillType?: BillTypeId;`,
    billsTest: `it.each(["maintenance", "repair", "fuel", "driver"] as const)("opens", () => {});`,
  };
  const checks = [
    ["healthy contract passes", check(healthy).length === 0],
    [
      "stringly typed creator fails",
      check({ ...healthy, createBill: "initialBillType?: string;" }).some((failure) =>
        failure.includes("not string"),
      ),
    ],
    [
      "incomplete route matrix fails",
      check({ ...healthy, billsTest: `it.each(["maintenance", "repair", "fuel"] as const)("opens", () => {});` }).some(
        (failure) => failure.includes("all four"),
      ),
    ],
  ];
  const failed = checks.filter(([, passed]) => !passed);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
