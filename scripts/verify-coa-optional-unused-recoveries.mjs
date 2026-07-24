#!/usr/bin/env node
/**
 * Owner 2026-07-23: unused OO-style recoveries must be OPTIONAL (not required validate).
 * Roles remain in COA_ROLE_VALUES / resolver so a stray settlement line still has a bind target.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selftest = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertOptionalRecoveries(src, label) {
  assert.match(src, /OPTIONAL_COA_ROLES/, `${label}: must export OPTIONAL_COA_ROLES`);
  for (const role of ["lease_recovery", "insurance_recovery", "fuel_advance_recovery", "other_recovery"]) {
    assert.match(src, new RegExp(`["']${role}["']`), `${label}: optional list must name ${role}`);
  }
  // CARRIER_DRIVER block must NOT list fuel_advance_recovery as required (heuristic: after
  // CARRIER_DRIVER const, fuel must not appear before FACTORING / OPTIONAL).
  const carrierStart = src.indexOf("const CARRIER_DRIVER");
  const optionalStart = src.indexOf("export const OPTIONAL_COA_ROLES");
  assert.ok(carrierStart >= 0 && optionalStart > carrierStart, `${label}: CARRIER_DRIVER + OPTIONAL present`);
  const carrierBlock = src.slice(carrierStart, optionalStart);
  assert.doesNotMatch(carrierBlock, /fuel_advance_recovery/, `${label}: fuel_advance_recovery must not be in CARRIER_DRIVER`);
  assert.doesNotMatch(carrierBlock, /insurance_recovery/, `${label}: insurance_recovery must not be in CARRIER_DRIVER`);
  assert.doesNotMatch(carrierBlock, /lease_recovery/, `${label}: lease_recovery must not be in CARRIER_DRIVER`);
  assert.doesNotMatch(carrierBlock, /other_recovery/, `${label}: other_recovery must not be in CARRIER_DRIVER`);
  assert.match(carrierBlock, /advance_recovery/, `${label}: advance_recovery stays required carrier`);
  assert.match(carrierBlock, /damage_recovery/, `${label}: damage_recovery stays required carrier`);
  assert.match(carrierBlock, /reimbursement_expense/, `${label}: reimbursement_expense stays required carrier`);
}

if (selftest) {
  const fixed = read("apps/backend/src/accounting/coa-roles/entity-required-roles.ts");
  assertOptionalRecoveries(fixed, "entity(fixed)");

  const bad = fixed.replace(
    /const CARRIER_DRIVER: readonly CoaRole\[\] = \[[\s\S]*?\];/,
    `const CARRIER_DRIVER: readonly CoaRole[] = [
  "escrow_liability_default",
  "fuel_advance_recovery",
  "insurance_recovery",
  "lease_recovery",
  "other_recovery",
];`
  );
  assert.notEqual(bad, fixed, "selftest must mutate CARRIER_DRIVER");
  let failed = false;
  try {
    assertOptionalRecoveries(bad, "entity(bug)");
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "selftest must FAIL when unused recoveries are required again");
  console.log("verify-coa-optional-unused-recoveries — selftest OK");
  process.exit(0);
}

assertOptionalRecoveries(read("apps/backend/src/accounting/coa-roles/entity-required-roles.ts"), "entity");
console.log("verify-coa-optional-unused-recoveries — OK");
