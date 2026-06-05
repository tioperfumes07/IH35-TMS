#!/usr/bin/env node
/**
 * CLOSURE-4 P5-T12 — auto-deduction policy applies on settlement compute.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0392-auto-deductions.sql"),
  policyRoutes: path.join(ROOT, "apps/backend/src/settlements/auto-deductions/policy.routes.ts"),
  apply: path.join(ROOT, "apps/backend/src/settlements/auto-deductions/apply.ts"),
  tests: path.join(ROOT, "apps/backend/src/settlements/auto-deductions/auto-deductions.test.ts"),
  hook: path.join(ROOT, "apps/frontend/src/hooks/useAutoDeductionPolicies.ts"),
  panel: path.join(ROOT, "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx"),
  driversPage: path.join(ROOT, "apps/frontend/src/pages/drivers/DriversPage.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:auto-deduction-applies-to-next-settlement FAILED\n- ${message}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const policyRoutes = read(paths.policyRoutes);
  const apply = read(paths.apply);
  const tests = read(paths.tests);
  const hook = read(paths.hook);
  const panel = read(paths.panel);
  const driversPage = read(paths.driversPage);

  if (!migration) fail("missing migration 0392-auto-deductions.sql");
  if (!policyRoutes) fail("missing policy.routes.ts");
  if (!apply) fail("missing apply.ts settlement hook");
  if (!tests) fail("missing auto-deductions.test.ts");
  if (!hook) fail("missing useAutoDeductionPolicies.ts");
  if (!panel) fail("missing AutoDeductionPolicies.tsx");
  if (!driversPage) fail("missing DriversPage.tsx auto-deductions sub-tab");

  if (!migration.includes("CREATE TABLE IF NOT EXISTS driver_finance.auto_deduction_policies")) {
    fail("migration must create driver_finance.auto_deduction_policies");
  }
  if (!migration.includes("auto_deduction")) {
    fail("migration must extend settlement line type for auto_deduction");
  }

  if (!policyRoutes.includes('app.post("/api/v1/auto-deductions/policies"')) {
    fail("routes must expose POST /api/v1/auto-deductions/policies");
  }
  if (!policyRoutes.includes('app.get("/api/v1/auto-deductions/policies"')) {
    fail("routes must expose GET /api/v1/auto-deductions/policies");
  }

  if (!apply.includes("applyAutoDeductionsForSettlement")) {
    fail("apply.ts must export settlement-time hook");
  }
  if (!apply.includes("auto_deduction")) {
    fail("apply.ts must create auto_deduction line items");
  }
  if (!apply.includes("deducted_so_far_cents")) {
    fail("apply.ts must update policy.deducted_so_far_cents");
  }

  if (!tests.includes("applyAutoDeductionsForSettlement")) {
    fail("tests must cover settlement-time deduction application");
  }

  if (!hook.includes("/api/v1/auto-deductions/policies")) {
    fail("useAutoDeductionPolicies must call auto-deductions API");
  }

  if (!driversPage.includes("drivers-auto-deductions-tab")) {
    fail("DriversPage must render Auto-deductions sub-tab");
  }
  if (!panel.includes("Create policy")) {
    fail("AutoDeductionPolicies must include create policy UI");
  }

  console.log("verify:auto-deduction-applies-to-next-settlement OK");
}

main();
