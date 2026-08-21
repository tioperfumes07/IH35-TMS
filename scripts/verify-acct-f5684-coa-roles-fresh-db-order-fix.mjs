#!/usr/bin/env node
/**
 * verify-acct-f5684-coa-roles-fresh-db-order-fix.mjs
 *
 * ACCT-F5684/ACCT-F5685 — fixes the P0 fresh-DB CI outage where
 * 202608180900_usmca_fixed_asset_depr_coa_roles.sql inserts accounting.chart_of_accounts_roles
 * rows with role values ('depr_expense_default'/'accum_depr_default') that the CHECK constraint
 * only permits after a LATER-FILENAMED, HELD migration (202609100050) widens it. On prod that
 * later file was Neon-applied out of filename order, hiding the bug there; a fresh replay always
 * applies in filename-sort order and fails at 202608180900.
 *
 * ACCT-F5684's FIRST fix attempt (hardcoding a full-superset constraint pre-widen directly in
 * 202608180900) was itself a regression: it broke the VERY NEXT constraint-touching migration,
 * 202609010020_fact_05_factor_wire_fee_role.sql, whose own independently-authored, narrower role
 * list doesn't include the two new roles — once 202608180900's widen let those rows insert
 * early, 202609010020's own DROP+ADD failed validating them. Confirmed live via a real GitHub
 * Actions run.
 *
 * THE CORRECTED FIX (this guard locks it): 202608180900's own role-binding INSERTs are wrapped
 * in BEGIN/EXCEPTION WHEN check_violation blocks that skip gracefully instead of aborting — no
 * constraint knowledge built into that file at all. A NEW migration, 202612880000 (ACCT-F5685),
 * runs at the very end of the chain (after every constraint-touching file, including the HELD
 * one) and idempotently completes the deferred bind.
 *
 * Locks: (1) 202608180900 no longer contains a §0 constraint pre-widen (the regression this
 * guard now forbids), (2) both role INSERTs are wrapped in exception handlers catching
 * check_violation, (3) the deferred-bind migration file exists and is idempotent (checks
 * v_already_bound before writing), (4) the checksum-override entry for 202608180900 matches its
 * CURRENT on-disk content and the known-applied prod ledger checksum never changes.
 *
 * Static-only: no DB connection. The full four-step chain (skip → next file unaffected → widen →
 * deferred bind completes) was proven live on a disposable Neon rehearsal branch using the exact
 * real file contents — documented in the PR body, not re-run here.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const migrationPath = "db/migrations/202608180900_usmca_fixed_asset_depr_coa_roles.sql";
const deferredBindPath = "db/migrations/202612880000_acct_f5685_usmca_fixed_asset_coa_roles_deferred_bind.sql";
const overridesPath = "scripts/lib/migration-checksum-overrides.json";
const KNOWN_PROD_LEDGER_CHECKSUM = "1f6fa0f8930df1610ea4776903cef9521b002d24a945582edb3fb91c8eb8d156";

function analyze() {
  const failures = [];

  if (!existsSync(migrationPath)) {
    failures.push(`${migrationPath}: file not found`);
    return failures;
  }
  const migrationSrc = readFileSync(migrationPath, "utf8");

  // Forbid the ACCT-F5684 regression: a hardcoded full-superset §0 pre-widen block. This is the
  // exact defect class this guard exists to prevent from recurring.
  if (/-- §0/.test(migrationSrc) || /DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check/.test(migrationSrc)) {
    failures.push(`${migrationPath}: contains a constraint DROP+ADD (the ACCT-F5684 regression that broke 202609010020) — this file must never touch the CHECK constraint directly, only fail-soft its own INSERTs`);
  }

  // Both role-binding INSERTs must be wrapped in an exception handler.
  const exceptionCount = (migrationSrc.match(/EXCEPTION WHEN check_violation THEN/g) ?? []).length;
  if (exceptionCount < 2) {
    failures.push(`${migrationPath}: expected 2 "EXCEPTION WHEN check_violation THEN" blocks (one per role INSERT), found ${exceptionCount}`);
  }
  if (!/'depr_expense_default'/.test(migrationSrc) || !/'accum_depr_default'/.test(migrationSrc)) {
    failures.push(`${migrationPath}: missing the depr_expense_default or accum_depr_default role INSERT entirely`);
  }

  // The deferred-bind migration must exist and be idempotent.
  if (!existsSync(deferredBindPath)) {
    failures.push(`${deferredBindPath}: deferred-bind migration not found`);
  } else {
    const deferredSrc = readFileSync(deferredBindPath, "utf8");
    if (!/v_already_bound/.test(deferredSrc)) {
      failures.push(`${deferredBindPath}: missing the already-bound idempotency guard`);
    }
    if (!/'depr_expense_default'/.test(deferredSrc) || !/'accum_depr_default'/.test(deferredSrc)) {
      failures.push(`${deferredBindPath}: missing the depr_expense_default or accum_depr_default role INSERT`);
    }
  }

  // Checksum-override entry must exist and match the CURRENT file content, with the ledger
  // checksum frozen at the known-applied prod value.
  if (!existsSync(overridesPath)) {
    failures.push(`${overridesPath}: overrides file not found`);
  } else {
    let overrides;
    try {
      overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
    } catch (e) {
      failures.push(`${overridesPath}: not valid JSON: ${e.message}`);
      return failures;
    }
    const entry = overrides.find((o) => o.filename === "202608180900_usmca_fixed_asset_depr_coa_roles.sql");
    if (!entry) {
      failures.push("no checksum-override entry registered for 202608180900_usmca_fixed_asset_depr_coa_roles.sql");
    } else {
      if (entry.ledger_checksum !== KNOWN_PROD_LEDGER_CHECKSUM) {
        failures.push(`override ledger_checksum (${entry.ledger_checksum}) does not match the known-applied prod checksum — this must never change`);
      }
      const currentDiskChecksum = createHash("sha256").update(migrationSrc, "utf8").digest("hex");
      if (entry.disk_checksum !== currentDiskChecksum) {
        failures.push(`override disk_checksum (${entry.disk_checksum}) does not match the file's current on-disk checksum (${currentDiskChecksum}) — the file was edited again without updating the override`);
      }
    }
  }

  return failures;
}

function selftest() {
  const good = analyze();
  if (good.length > 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const migrationSrc = readFileSync(migrationPath, "utf8");

  // Mutation 1: reintroduce the forbidden §0 constraint DROP+ADD (the exact ACCT-F5684 regression).
  const mutated1 = migrationSrc.replace(
    "BEGIN;\n\nDO $$\nDECLARE\n  v_usmca uuid;",
    "BEGIN;\n\n-- §0 test injection\nDO $$\nBEGIN\n  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN\n    ALTER TABLE accounting.chart_of_accounts_roles\n      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;\n  END IF;\nEND\n$$;\n\nDO $$\nDECLARE\n  v_usmca uuid;"
  );
  if (mutated1 === migrationSrc) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  writeAndCheck(mutated1, "mutation 1 (reintroduce §0 constraint DROP+ADD)");

  // Mutation 2: drop the deferred-bind migration file's idempotency guard reference (simulate via
  // corrupting the checksum-override entry's disk_checksum, the cheapest reliable single-file mutation).
  const overridesRaw = readFileSync(overridesPath, "utf8");
  const currentDiskChecksum = createHash("sha256").update(migrationSrc, "utf8").digest("hex");
  const mutatedOverrides = overridesRaw.replace(`"disk_checksum": "${currentDiskChecksum}"`, '"disk_checksum": "0000000000000000000000000000000000000000000000000000000000000000"');
  if (mutatedOverrides === overridesRaw) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  const backup = overridesRaw;
  writeFileSync(overridesPath, mutatedOverrides);
  const failures2 = analyze();
  writeFileSync(overridesPath, backup);
  if (failures2.length === 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 2 (corrupt override disk_checksum) was not caught");
    process.exit(1);
  }

  console.log("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: OK (good files clean, both targeted mutations caught)");
}

function writeAndCheck(mutatedMigrationSrc, label) {
  const backup = readFileSync(migrationPath, "utf8");
  writeFileSync(migrationPath, mutatedMigrationSrc);
  const failures = analyze();
  writeFileSync(migrationPath, backup);
  if (failures.length === 0) {
    console.error(`verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: ${label} was not caught`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze();
  if (failures.length > 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-acct-f5684-coa-roles-fresh-db-order-fix: OK — 202608180900 fails soft (no constraint DROP+ADD), deferred bind migration exists and is idempotent, checksum-override registered correctly");
}
