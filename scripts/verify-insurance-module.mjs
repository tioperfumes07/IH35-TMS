#!/usr/bin/env node
/**
 * Block 5 / GAP-86 — Insurance policy creator + bill schedule CI guard
 * Exits 0 on success, 1 on any failure.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

// 1 — Migration
const migration = read("db/migrations/202606071800_insurance_bill_schedule_link.sql");
contains("db/migrations/202606071800_insurance_bill_schedule_link.sql", migration, [
  { pattern: /ALTER TABLE insurance\.policy/, label: "ALTER TABLE insurance.policy" },
  { pattern: /vendor_id/, label: "vendor_id column" },
  { pattern: /ALTER TABLE insurance\.payment_schedule/, label: "ALTER TABLE insurance.payment_schedule" },
  { pattern: /bill_uuid/, label: "bill_uuid column" },
]);

// 2 — Bill schedule service
const billScheduleService = read("apps/backend/src/insurance/policy-bill-schedule.service.ts");
contains("apps/backend/src/insurance/policy-bill-schedule.service.ts", billScheduleService, [
  { pattern: /createBill/, label: "imports or calls createBill()" },
  { pattern: /createPolicyBillSchedule/, label: "exports createPolicyBillSchedule" },
  { pattern: /insurance\.payment_schedule/, label: "inserts into insurance.payment_schedule" },
  { pattern: /bill_uuid/, label: "persists bill_uuid back to schedule" },
  { pattern: /NO NEW FINANCIAL CODE|FINANCIAL RULE/, label: "financial rule comment" },
]);

// 3 — Policy routes: vendor_id wired
const policyRoutes = read("apps/backend/src/insurance/policy.routes.ts");
contains("apps/backend/src/insurance/policy.routes.ts", policyRoutes, [
  { pattern: /policy-bill-schedule\.service/, label: "imports policy-bill-schedule service" },
  { pattern: /createPolicyBillSchedule/, label: "calls createPolicyBillSchedule" },
  { pattern: /vendor_id/, label: "vendor_id in createPolicySchema" },
]);

// 4 — Frontend: vendor picker added to modal
const policyModal = read("apps/frontend/src/components/insurance/PolicyCreateModal.tsx");
contains("apps/frontend/src/components/insurance/PolicyCreateModal.tsx", policyModal, [
  { pattern: /selectedVendorId/, label: "selectedVendorId state" },
  { pattern: /accounting\/vendors/, label: "accounting vendors API call" },
  { pattern: /vendor_id.*vendorId|vendorId.*vendor_id/, label: "vendor_id passed in mutation" },
]);

// 5 — Frontend API type: vendor_id
const insuranceApi = read("apps/frontend/src/api/insurance.ts");
contains("apps/frontend/src/api/insurance.ts", insuranceApi, [
  { pattern: /vendor_id.*string.*null|vendor_id\?.*string/, label: "vendor_id in CreateInsurancePolicyPayload" },
]);

// 6 — Block manifest
const manifest = read(".block-ready/BLOCK5-INSURANCE-CREATOR.json");
contains(".block-ready/BLOCK5-INSURANCE-CREATOR.json", manifest, [
  { pattern: /BLOCK5-INSURANCE-CREATOR/, label: "block_id present" },
  { pattern: /GAP-86/, label: "gap reference" },
  { pattern: /createBill/, label: "financial rule documented" },
]);

// 7 — Spec doc
read("docs/specs/gap-86-insurance-module.md");

if (failures.length > 0) {
  console.error("\n❌  verify-insurance-module FAILED:\n");
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
} else {
  console.log("✅  verify-insurance-module: all checks passed.");
  process.exit(0);
}
