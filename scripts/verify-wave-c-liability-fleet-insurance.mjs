#!/usr/bin/env node
/**
 * WAVE-C-liability-fleet-insurance — fleet module "Liability / Reserve" column,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: unit.profile.insurance_summary, unit.edit.insurance,
 * unit.profile.insurance_claims_reverse, trailer.profile.insurance_claims_reverse.
 *
 * All four already real, never tagged @matrix-built:
 *   - unit.profile.insurance_summary / unit.edit.insurance: VehicleProfilePage.tsx mounts
 *     InsuranceSummarySection.tsx, which renders real FK-linked insurance.policy_unit coverage
 *     data (us_policy/mx_policy + real coverage_type-labelled policies, integer cents).
 *   - unit.profile.insurance_claims_reverse / trailer.profile.insurance_claims_reverse:
 *     VehicleProfilePage.tsx and TrailerProfilePage.tsx both mount
 *     InsuranceClaimsReverseSection.tsx, which renders real claim economics
 *     (deductible_cents, fault, recovery_rail) reverse-linked from the unit/trailer.
 *
 * fleet's other liability/gl_je leaves (roster.row.edit_unit, unit.profile.trip_cost,
 * unit.profile.financial_pl, unit.profile.bank_txns, unit.profile.qbo_mapping,
 * unit.edit.financial, unit.detail.finance_linkage, trailer.profile.bank_txns) are NOT tagged
 * here — unit-financial.service.ts (unit.profile.financial_pl) sources cost data from
 * mdata.loads, driver_finance.driver_bills, and maintenance.work_orders.total_actual_cost, none
 * of which is a direct accounting.journal_entries / accounting.expenses join, so gl_je was not
 * independently confirmed; left as real remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["fleet"],"cols":["liability"],"leafRe":"^(unit\\.profile\\.insurance_summary|unit\\.edit\\.insurance|unit\\.profile\\.insurance_claims_reverse|trailer\\.profile\\.insurance_claims_reverse)$","task":"WAVE-C-liability-fleet-insurance","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-liability-fleet-insurance.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-liability-fleet-insurance";

const CHECKS = [
  {
    name: "VehicleProfilePage.tsx mounts InsuranceSummarySection",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /InsuranceSummarySection/,
  },
  {
    name: "InsuranceSummarySection.tsx renders real FK-linked policy_unit coverage",
    file: "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
    pattern: /insurance\.policy_unit/,
  },
  {
    name: "VehicleProfilePage.tsx mounts InsuranceClaimsReverseSection",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /InsuranceClaimsReverseSection/,
  },
  {
    name: "TrailerProfilePage.tsx mounts InsuranceClaimsReverseSection",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /InsuranceClaimsReverseSection/,
  },
  {
    name: "InsuranceClaimsReverseSection.tsx renders real claim economics (deductible_cents)",
    file: "apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx",
    pattern: /deductible_cents/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx":
      "<InsuranceSummarySection ... /> <InsuranceClaimsReverseSection ... />",
    "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx": "insurance.policy_unit",
    "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx": "<InsuranceClaimsReverseSection ... />",
    "apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx": "claim.deductible_cents",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — fleet unit/trailer insurance summary + claims-reverse liability wiring present`);
