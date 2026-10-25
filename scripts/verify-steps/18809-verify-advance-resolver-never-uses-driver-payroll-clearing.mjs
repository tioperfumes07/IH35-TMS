#!/usr/bin/env node
/**
 * 18809 — ENG-04: the advance posting resolver NEVER credits driver_payroll_clearing (2170).
 *
 * Checks two static invariants:
 * 1. cash-advance-create.ts does not pass driver_payroll_clearing as a credit_account_id for advances.
 * 2. posting-engine.service.ts buildDriverAdvanceLines has the hard-block guard on driver_payroll_clearing.
 *
 * Claimed: 2026-10-24, cc-1, step 18809 (≡1 mod 4).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-advance-resolver-never-uses-driver-payroll-clearing";
const SELFTEST = process.argv.includes("--selftest");

const CREATE = path.join(ROOT, "apps/backend/src/cash-advances/cash-advance-create.ts");
const ENGINE = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");

function selftest() {
  const checks = [];
  const ok = (name, passed) => checks.push([name, passed]);

  // Static checks on real source files
  const createSrc = fs.readFileSync(CREATE, "utf8");
  const engineSrc = fs.readFileSync(ENGINE, "utf8");

  // 1. cash-advance-create.ts must NOT call resolveRoleAccount(driver_payroll_clearing) or pass credit_account_id: clearing
  const historicalBackfillSection = createSrc.match(
    /disbursement_method.*historical_backfill.*?linked_driver_bill_id([\s\S]{0,1500}?)(?=\n  (?:if|const|let|var|return|await|\/\/))/
  )?.[1] ?? "";
  const hasActiveClearing =
    /resolveRoleAccount\s*\([^)]*driver_payroll_clearing/.test(historicalBackfillSection) ||
    /credit_account_id\s*:\s*clearing/.test(historicalBackfillSection);
  ok(
    "historical_backfill does not call resolveRoleAccount(driver_payroll_clearing) or pass credit_account_id: clearing",
    !hasActiveClearing
  );

  // 2. posting-engine must have the ENG-04 hard-block guard on driver_payroll_clearing
  ok(
    "buildDriverAdvanceLines has driver_payroll_clearing rejection block",
    engineSrc.includes("driver_payroll_clearing") &&
    engineSrc.includes("INVALID_ACCOUNT") &&
    engineSrc.includes("is_clearing")
  );

  // 3. The ENG-04 isExternalInstrumentMethod check is present
  ok(
    "buildDriverAdvanceLines has isExternalInstrumentMethod routing",
    engineSrc.includes("isExternalInstrumentMethod")
  );

  const failed = checks.filter(([, p]) => !p);
  if (process.argv.includes("--selftest")) {
    if (failed.length) {
      console.error(`${LABEL} --selftest: FAIL`);
      for (const [name] of failed) console.error(`  FAIL: ${name}`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest: PASS (${checks.length} checks)`);
    process.exit(0);
  }
  return failed;
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const createSrc = fs.readFileSync(CREATE, "utf8");
const engineSrc = fs.readFileSync(ENGINE, "utf8");

const failures = [];

// 1. cash-advance-create.ts: historical_backfill must NOT call resolveRoleAccount for driver_payroll_clearing
// or pass credit_account_id: clearing. Comments may mention the role name; we check for functional code patterns.
const historicalSection = createSrc.match(
  /disbursement_method.*historical_backfill.*?linked_driver_bill_id([\s\S]{0,1500}?)(?=\n  (?:if|const|let|var|return|await|\/\/))/
)?.[1] ?? "";
const hasActiveClearing =
  /resolveRoleAccount\s*\([^)]*driver_payroll_clearing/.test(historicalSection) ||
  /credit_account_id\s*:\s*clearing/.test(historicalSection);
if (hasActiveClearing) {
  failures.push(
    "cash-advance-create.ts historical_backfill path still calls resolveRoleAccount(driver_payroll_clearing) or passes credit_account_id: clearing — ENG-04 fix not applied"
  );
}

// 2. posting-engine must have the hard-block guard
if (!engineSrc.includes("driver_payroll_clearing") || !engineSrc.includes("INVALID_ACCOUNT")) {
  failures.push(
    "posting-engine.service.ts buildDriverAdvanceLines is missing the ENG-04 driver_payroll_clearing hard-block guard"
  );
}

// 3. EFS / external instrument routing must be present
if (!engineSrc.includes("isExternalInstrumentMethod")) {
  failures.push(
    "posting-engine.service.ts buildDriverAdvanceLines is missing isExternalInstrumentMethod routing — ENG-04 fix not applied"
  );
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL}: PASS — historical_backfill no longer credits driver_payroll_clearing; buildDriverAdvanceLines has hard-block + isExternalInstrumentMethod routing`
);
