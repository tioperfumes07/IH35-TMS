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

// 2 — Bill schedule service (forward-fix hardening)
const billScheduleService = read("apps/backend/src/insurance/policy-bill-schedule.service.ts");
contains("apps/backend/src/insurance/policy-bill-schedule.service.ts", billScheduleService, [
  { pattern: /createBill/, label: "imports or calls createBill()" },
  { pattern: /voidBill/, label: "voids committed bills on rollback" },
  { pattern: /createPolicyBillSchedule/, label: "exports createPolicyBillSchedule" },
  { pattern: /insurance\.payment_schedule/, label: "inserts into insurance.payment_schedule" },
  { pattern: /bill_uuid/, label: "persists bill_uuid back to schedule" },
  { pattern: /NO NEW FINANCIAL CODE|FINANCIAL RULE/, label: "financial rule comment" },
  { pattern: /bill_uuid IS NOT NULL/, label: "replay-skip pre-check" },
  { pattern: /INS-\$\{policy\.policy_number\}-DP|down_payment/, label: "down payment billed" },
  { pattern: /insurance_vendor_not_resolvable/, label: "pre-flight vendor validation" },
  { pattern: /captureMessage/, label: "CRITICAL Sentry alert on orphaned bills" },
]);

// 2b — Belt-and-suspenders UNIQUE index migration
const uniqueMigration = read("db/migrations/202606072100_insurance_payment_schedule_bill_uuid_unique.sql");
contains("db/migrations/202606072100_insurance_payment_schedule_bill_uuid_unique.sql", uniqueMigration, [
  { pattern: /CREATE UNIQUE INDEX IF NOT EXISTS/, label: "unique index" },
  { pattern: /payment_schedule \(bill_uuid\)/, label: "on payment_schedule(bill_uuid)" },
  { pattern: /WHERE bill_uuid IS NOT NULL/, label: "partial (bill_uuid IS NOT NULL)" },
]);

// 3 — Policy routes: atomic firing, no silent warning swallow
const policyRoutes = read("apps/backend/src/insurance/policy.routes.ts");
contains("apps/backend/src/insurance/policy.routes.ts", policyRoutes, [
  { pattern: /policy-bill-schedule\.service/, label: "imports policy-bill-schedule service" },
  { pattern: /createPolicyBillSchedule/, label: "calls createPolicyBillSchedule" },
  { pattern: /vendor_id/, label: "vendor_id in createPolicySchema" },
  { pattern: /id = \$1::uuid[\s\S]{0,160}operating_company_id = \$2::uuid[\s\S]{0,160}deactivated_at IS NULL/, label: "entity-scoped active vendor validation" },
]);
if (policyRoutes && /X-Bill-Schedule-Warning/.test(policyRoutes)) {
  fail("apps/backend/src/insurance/policy.routes.ts: non-fatal X-Bill-Schedule-Warning path must be removed (atomic hard-fail required)");
}

// 3b — Idempotency middleware now guards insurance policies
const idempotency = read("apps/backend/src/middleware/idempotency.ts");
contains("apps/backend/src/middleware/idempotency.ts", idempotency, [
  { pattern: /insurance\\\/policies\(\\\/\|\$\)/, label: "insurance/policies in REQUIRED_MATCHERS" },
]);

// 4 — Frontend: vendor picker added to modal
const policyModal = read("apps/frontend/src/components/insurance/PolicyCreateModal.tsx");
contains("apps/frontend/src/components/insurance/PolicyCreateModal.tsx", policyModal, [
  { pattern: /insurer_vendor_id/, label: "canonical insurer vendor state" },
  { pattern: /listVendors/, label: "entity-scoped mdata vendor API call" },
  { pattern: /vendor_id:\s*next\.payload\.insurer_vendor_id/, label: "vendor_id passed in mutation" },
]);

// 5 — Frontend API type: vendor_id
const insuranceApi = read("apps/frontend/src/api/insurance.ts");
contains("apps/frontend/src/api/insurance.ts", insuranceApi, [
  { pattern: /CreateInsurancePolicyPayload[\s\S]{0,200}vendor_id:\s*string/, label: "vendor_id in CreateInsurancePolicyPayload" },
  { pattern: /CreatePolicyWithBillsPayload[\s\S]{0,200}vendor_id:\s*string/, label: "vendor_id in CreatePolicyWithBillsPayload" },
]);

const policyWizard = read("apps/frontend/src/components/insurance/PolicyCreateWizard.tsx");
contains("apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", policyWizard, [
  { pattern: /vendor_id:\s*step1\.insurer_vendor_id/, label: "wizard passes vendor_id to atomic writer" },
]);

const atomicRoute = read("apps/backend/src/insurance/policy-create-atomic.routes.ts");
contains("apps/backend/src/insurance/policy-create-atomic.routes.ts", atomicRoute, [
  { pattern: /vendor_id:\s*z\.string\(\)\.uuid\(\)/, label: "atomic route requires vendor UUID" },
  { pattern: /vendorId:\s*body\.vendor_id/, label: "atomic route forwards vendor UUID" },
]);

const atomicService = read("apps/backend/src/insurance/policy-create-atomic.service.ts");
contains("apps/backend/src/insurance/policy-create-atomic.service.ts", atomicService, [
  { pattern: /operating_company_id = \$2::uuid[\s\S]{0,80}deactivated_at IS NULL/, label: "atomic writer validates entity-scoped active vendor" },
  { pattern: /operating_company_id, vendor_id, insurer_name/, label: "atomic writer stamps policy vendor FK" },
  { pattern: /vendorId:\s*input\.vendorId/, label: "bill writer reuses selected vendor FK" },
]);

// 6 — Block manifest
const manifest = read(".block-ready/GAP-86-INSURANCE-BILL-CREATOR.json");
contains(".block-ready/GAP-86-INSURANCE-BILL-CREATOR.json", manifest, [
  { pattern: /GAP-86-INSURANCE-BILL-CREATOR/, label: "block_id present" },
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
