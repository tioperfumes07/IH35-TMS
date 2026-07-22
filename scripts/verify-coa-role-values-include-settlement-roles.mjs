#!/usr/bin/env node
// GUARD (Rule 16): the PRIMARY CoA-role enum (COA_ROLE_VALUES in the backend resolver) MUST include the
// settlement / driver / reimbursement / recovery role keys, so the posters can resolve them from
// accounting.chart_of_accounts_roles and the owner can designate them on the CoA Roles page. Also
// verifies the additive migration widened accounting.chart_of_accounts_roles.role CHECK to include them
// (code enum ↔ DB CHECK parity), so a future narrowing of either cannot silently break settlement posting.
//
// Run: node scripts/verify-coa-role-values-include-settlement-roles.mjs [--selftest]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
// Latest widen that must permit the full settlement + pay-run role set (true supersets of earlier wideners).
const MIGRATION = "db/migrations/202607710000_payrun_abandonment_chargeback_coa_role.sql";

// Required by the task (hard set) + the full recovery set the settlement posters resolve dynamically
// + pay-run close abandonment chargeback residual.
const REQUIRED_ROLES = [
  "driver_pay_expense",
  "driver_payroll_clearing",
  "reimbursement_expense",
  "advance_recovery",
  "damage_recovery",
  "lease_recovery",
  "insurance_recovery",
  "fuel_advance_recovery",
  "other_recovery",
  "abandonment_chargeback_recovery",
];

function extractCoaRoleValues(source) {
  const m = source.match(/export const COA_ROLE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!m) return null;
  return new Set(Array.from(m[1].matchAll(/["']([a-z_]+)["']/g)).map((x) => x[1]));
}

function missingFrom(setLike, required) {
  return required.filter((r) => !setLike.has(r));
}

function selftest() {
  const goodBlock = `export const COA_ROLE_VALUES = [\n${REQUIRED_ROLES.map((r) => `  "${r}",`).join("\n")}\n] as const;`;
  const badBlock = `export const COA_ROLE_VALUES = [\n  "ar_control",\n] as const;`;
  const goodSet = extractCoaRoleValues(goodBlock);
  const badSet = extractCoaRoleValues(badBlock);
  const failures = [];
  if (!goodSet || missingFrom(goodSet, REQUIRED_ROLES).length !== 0) failures.push("detector missed a complete role set");
  if (!badSet || missingFrom(badSet, REQUIRED_ROLES).length !== REQUIRED_ROLES.length) failures.push("detector did not flag a missing-role set");
  if (extractCoaRoleValues("no array here") !== null) failures.push("detector did not report an unparseable file");
  if (failures.length > 0) {
    console.error("verify-coa-role-values-include-settlement-roles SELFTEST FAILED:");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-coa-role-values-include-settlement-roles selftest passed");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const resolverAbs = path.join(ROOT, RESOLVER);
  if (!fs.existsSync(resolverAbs)) {
    console.error(`verify-coa-role-values-include-settlement-roles: resolver missing: ${RESOLVER}`);
    process.exit(1);
  }
  const roleSet = extractCoaRoleValues(fs.readFileSync(resolverAbs, "utf8"));
  if (!roleSet) {
    console.error(`verify-coa-role-values-include-settlement-roles: could not parse COA_ROLE_VALUES in ${RESOLVER}`);
    process.exit(1);
  }
  const missingCode = missingFrom(roleSet, REQUIRED_ROLES);
  if (missingCode.length > 0) {
    console.error(`verify-coa-role-values-include-settlement-roles FAILED: COA_ROLE_VALUES missing: ${missingCode.join(", ")}`);
    process.exit(1);
  }

  // DB CHECK parity: the widen migration must permit the same roles in accounting.chart_of_accounts_roles.
  const migAbs = path.join(ROOT, MIGRATION);
  if (!fs.existsSync(migAbs)) {
    console.error(`verify-coa-role-values-include-settlement-roles: widen migration missing: ${MIGRATION}`);
    process.exit(1);
  }
  const migSource = fs.readFileSync(migAbs, "utf8");
  const missingMig = REQUIRED_ROLES.filter((r) => !new RegExp(`'${r}'`).test(migSource));
  if (missingMig.length > 0) {
    console.error(`verify-coa-role-values-include-settlement-roles FAILED: migration CHECK missing: ${missingMig.join(", ")}`);
    process.exit(1);
  }

  console.log(`verify-coa-role-values-include-settlement-roles passed (${REQUIRED_ROLES.length} roles present in enum + migration CHECK)`);
}

main();
