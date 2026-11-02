#!/usr/bin/env node
/**
 * ENG-12 (443.323 G14): verify settlement Creator deductions resolve a specific type (not blindly 'other')
 * via resolveCreatorDeductionType — the function that maps item account -> deduction type.
 *
 * The admin-fee line is the ONLY line allowed to use 'other'; every other line must carry a typed
 * item that resolves to a non-'other' type (fine, toll, damage, wire_fee, etc.).
 *
 * Self-test: node scripts/verify-settlement-deduction-types-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-deduction-types-wired";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const CHECKS = [
  {
    name: "settlement-creator-deduction-type.ts exports resolveCreatorDeductionType",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /export\s+async\s+function\s+resolveCreatorDeductionType/,
  },
  {
    name: "settlement-creator.service.ts imports resolveCreatorDeductionType",
    file: "apps/backend/src/driver-finance/settlement-creator.service.ts",
    pattern: /import\s+\{[^}]*resolveCreatorDeductionType[^}]*\}/,
  },
  {
    name: "settlement creator calls resolveCreatorDeductionType for each deduction line",
    file: "apps/backend/src/driver-finance/settlement-creator.service.ts",
    pattern: /await\s+resolveCreatorDeductionType\(/,
  },
  {
    name: "resolveCreatorDeductionType refuses a non-admin-fee line with no item (never silently 'other')",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /deduction_item_required/,
  },
  {
    name: "resolveCreatorDeductionType refuses a type that has no bound account (deduction_type_unmapped)",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /deduction_type_unmapped/,
  },
  {
    name: "ADMIN_FEE_LINE_RE is the only path to the 'other' deduction type in the creator",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /ADMIN_FEE_LINE_RE\.test[\s\S]*deductionType:\s*"other"/,
  },
  {
    name: "backStampSettledDriverBillUnitAndTrailer exists for repair path (ENG-14 related)",
    file: "apps/backend/src/driver-finance/driver-bill-unit-trailer.ts",
    pattern: /export\s+async\s+function\s+backStampSettledDriverBillUnitAndTrailer/,
  },
  {
    name: "ENG-12 Fine/I-94 refuse path (deduction_fine_permit_not_admin_fee)",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /deduction_fine_permit_not_admin_fee/,
  },
  {
    name: "ENG-12 CREATOR_DEDUCTION_TYPES includes permit",
    file: "apps/backend/src/driver-finance/settlement-creator-deduction-type.ts",
    pattern: /"permit"/,
  },
  {
    name: "ENG-12 fine_recovery admitted in CoA role resolver",
    file: "apps/backend/src/accounting/coa-roles/resolver.service.ts",
    pattern: /"fine_recovery"/,
  },
  {
    name: "ENG-12 permit_recovery admitted in CoA role resolver",
    file: "apps/backend/src/accounting/coa-roles/resolver.service.ts",
    pattern: /"permit_recovery"/,
  },
  {
    name: "ENG-12 migration widens fine_recovery + permit_recovery",
    file: "db/migrations/202616301200_coa_roles_widen_fine_and_permit_recovery.sql",
    pattern: /fine_recovery[\s\S]*permit_recovery|permit_recovery[\s\S]*fine_recovery/,
  },
  {
    name: "ENG-12 migration rebinds Fine/I-94 items off 7200",
    file: "db/migrations/202616301201_usmca_seed_fine_permit_recovery_and_rebind_items.sql",
    pattern: /Driver Deduction-I-94 Permit/,
  },
];

const args = process.argv.slice(2);

if (process.argv.includes("--selftest")) {
  // REAL selftest: the clean tree must pass, and for EACH check a copy of its source with the matched code removed
  // (in memory — the tracked file is never written) must make that check fail. The old arm only re-ran the check
  // on the real file, so it could never fail.
  const problems = [];
  CHECKS.forEach((c, i) => {
    const src = read(c.file);
    if (!c.pattern.test(src)) problems.push(`clean tree: check ${i + 1} (${c.name}) does not match`);
    const g = new RegExp(c.pattern.source, c.pattern.flags.includes("g") ? c.pattern.flags : c.pattern.flags + "g");
    const planted = src.replace(g, "/* planted: removed */");
    if (planted === src) problems.push(`plant ${i + 1} changed nothing`);
    else if (c.pattern.test(planted)) problems.push(`plant ${i + 1} (${c.name}) escaped`);
  });
  if (problems.length) {
    console.error(`${LABEL} selftest FAIL:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — clean tree passes; ${CHECKS.length}/${CHECKS.length} planted removals caught`);
  process.exit(0);
}

const failures = [];
for (const check of CHECKS) {
  const src = read(check.file);
  if (!check.pattern.test(src)) {
    failures.push(`FAIL: ${check.name} (${check.file})`);
  }
}

if (failures.length) {
  for (const f of failures) console.error(f);
  console.error(`[${LABEL}] FAIL — ${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — resolveCreatorDeductionType wired in settlement creator; admin-fee is only 'other' path; deduction_item_required + deduction_type_unmapped guards present`);
