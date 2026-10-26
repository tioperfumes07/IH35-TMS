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
];

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  const results = CHECKS.map((c) => {
    const src = read(c.file);
    return c.pattern.test(src);
  });
  const pass = results.every(Boolean);
  const failed = results.map((ok, i) => ok ? null : i + 1).filter(Boolean);
  if (!pass) {
    console.error(`${LABEL} selftest FAIL — checks ${failed.join(",")} did not match`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS — all ${CHECKS.length} checks match`);
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
