#!/usr/bin/env node
/**
 * WAVE-C-gl_je-fuel-expense-mapping — fuel module "GL / JE" column, leaf expense_mapping.
 * VERTICAL-WIRING-LAW-2026-08-12.
 *
 * fuel.expense_mapping (/fuel/expense-mapping) was already real but never tagged
 * @matrix-built. FuelGlMappingCoverage.tsx reads the real expense_category_map
 * (category_kind='fuel') that maps each fuel category to a real catalogs.accounts GL
 * expense account — the SAME map the Tier-1 CHAIN fuel-posting engine
 * (fuel-posting/poster.service.ts) consumes when it actually posts fuel spend to the GL. This
 * screen is read-only (verify-only, no posting) but the mapping it surfaces IS the real GL
 * routing table, not a placeholder.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["fuel"],"cols":["gl_je"],"leafRe":"^(expense_mapping|fuel\\.modal\\.create_fuel_transaction)$","task":"WAVE-C-gl_je-fuel-expense-mapping","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-fuel-expense-mapping.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-fuel-expense-mapping";

const CHECKS = [
  {
    name: "FuelPlannerHome.tsx mounts FuelGlMappingCoverage on the expense_mapping tab",
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    pattern: /tab === "expense_mapping"[\s\S]*<FuelGlMappingCoverage/,
  },
  {
    name: "FuelGlMappingCoverage.tsx reads the real fuel expense_category_map",
    file: "apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx",
    pattern: /listExpenseCategoryMappings\(companyId, \{ category_kind: "fuel" \}\)/,
  },
  {
    name: "FuelGlMappingCoverage.tsx documents the real fuel-posting engine consumer",
    file: "apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx",
    pattern: /fuel-posting\/poster\.service\.ts/,
  },
  {
    name: "CreateFuelTransactionModal.tsx posts via createFuelTransaction",
    file: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
    pattern: /await createFuelTransaction\(/,
  },
  {
    name: "fuel-transactions.routes.ts flushes GL posts after commit",
    file: "apps/backend/src/fuel/fuel-transactions.routes.ts",
    pattern: /flushFuelGlPostsAfterCommit/,
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
    "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx":
      'tab === "expense_mapping" ? (\n  <FuelGlMappingCoverage companyId={companyId} />\n) : null',
    "apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx":
      'listExpenseCategoryMappings(companyId, { category_kind: "fuel" }) ... fuel-posting/poster.service.ts',
    "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx":
      "await createFuelTransaction(operatingCompanyId, {",
    "apps/backend/src/fuel/fuel-transactions.routes.ts":
      "await flushFuelGlPostsAfterCommit(",
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
console.log(`[${LABEL}] PASS — fuel expense_mapping gl_je wiring present`);
