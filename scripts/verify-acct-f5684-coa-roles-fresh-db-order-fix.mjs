#!/usr/bin/env node
/**
 * verify-acct-f5684-coa-roles-fresh-db-order-fix.mjs
 *
 * ACCT-F5684 — 202608180900_usmca_fixed_asset_depr_coa_roles.sql inserts
 * accounting.chart_of_accounts_roles rows with role='depr_expense_default'/'accum_depr_default',
 * but the CHECK constraint permitting those values only shipped in the later-FILENAMED,
 * HELD migration 202609100050_fa_archive_fixed_assets_schema_coa_roles.sql. On prod that later
 * file was Neon-applied out of filename order (2026-07-28, three weeks before 202608180900's own
 * 2026-08-18 apply date) — so prod never hit the bug. A FRESH database replay (CI, local dev, a
 * rehearsal branch) always applies strictly in filename-sort order and fails at 202608180900
 * every time. Fixed by an ADDITIVE §0 defensive pre-widen inside 202608180900 itself (a
 * checksum-override edit — the file is already applied on prod, registered in
 * scripts/lib/migration-checksum-overrides.json so db:migrate never re-runs the changed content
 * there).
 *
 * This guard locks: (1) the §0 pre-widen exists and runs BEFORE the file's own role INSERTs,
 * (2) it includes both role values this file needs, (3) it is idempotent (guarded, DROP+ADD
 * pattern matching the sibling migration's own convention), (4) the checksum-override entry for
 * this exact filename is registered with the disk checksum matching the file's CURRENT content
 * (so a future edit to this file without updating the override would be caught), and (5) the
 * ledger_checksum in the override matches the known-applied prod checksum (never silently
 * changed).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const migrationPath = "db/migrations/202608180900_usmca_fixed_asset_depr_coa_roles.sql";
const overridesPath = "scripts/lib/migration-checksum-overrides.json";
const KNOWN_PROD_LEDGER_CHECKSUM = "1f6fa0f8930df1610ea4776903cef9521b002d24a945582edb3fb91c8eb8d156";

const migrationSrc = readFileSync(migrationPath, "utf8");
const overridesRaw = readFileSync(overridesPath, "utf8");

function analyze(migrationSrc, overridesRaw) {
  const failures = [];

  const zeroIdx = migrationSrc.indexOf("-- §0");
  const insertIdx = migrationSrc.indexOf("INSERT INTO accounting.chart_of_accounts_roles");
  if (zeroIdx === -1) {
    failures.push("§0 defensive pre-widen block not found");
  } else if (insertIdx === -1) {
    failures.push("the file's own chart_of_accounts_roles INSERT is missing entirely");
  } else if (zeroIdx > insertIdx) {
    failures.push("§0 pre-widen appears AFTER the role INSERT — must run before it to have any effect");
  }

  if (!/DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check/.test(migrationSrc)) {
    failures.push("§0 does not DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check (not idempotent-safe)");
  }
  if (!/ADD CONSTRAINT chart_of_accounts_roles_role_check/.test(migrationSrc)) {
    failures.push("§0 does not re-ADD chart_of_accounts_roles_role_check");
  }
  if (!/'depr_expense_default'/.test(migrationSrc) || !/'accum_depr_default'/.test(migrationSrc)) {
    failures.push("§0's widened CHECK list is missing depr_expense_default or accum_depr_default — the exact two roles this file's own INSERT needs");
  }
  if (!/to_regclass\('accounting\.chart_of_accounts_roles'\) IS NOT NULL/.test(migrationSrc)) {
    failures.push("§0 is not guarded by a to_regclass existence check (would break on a partial/pre-schema DB)");
  }

  let overrides;
  try {
    overrides = JSON.parse(overridesRaw);
  } catch (e) {
    failures.push(`checksum-overrides file is not valid JSON: ${e.message}`);
    return failures;
  }
  const entry = overrides.find((o) => o.filename === "202608180900_usmca_fixed_asset_depr_coa_roles.sql");
  if (!entry) {
    failures.push("no checksum-override entry registered for 202608180900_usmca_fixed_asset_depr_coa_roles.sql — db:migrate will treat this edit as unexplained drift against prod");
  } else {
    if (entry.ledger_checksum !== KNOWN_PROD_LEDGER_CHECKSUM) {
      failures.push(`override ledger_checksum (${entry.ledger_checksum}) does not match the known-applied prod checksum (${KNOWN_PROD_LEDGER_CHECKSUM}) — this must never change, it records what prod already ran`);
    }
    const currentDiskChecksum = createHash("sha256").update(migrationSrc, "utf8").digest("hex");
    if (entry.disk_checksum !== currentDiskChecksum) {
      failures.push(`override disk_checksum (${entry.disk_checksum}) does not match the file's current on-disk checksum (${currentDiskChecksum}) — the file was edited again without updating the override, db:migrate will now flag it as unexplained drift`);
    }
  }

  return failures;
}

function selftest() {
  const good = analyze(migrationSrc, overridesRaw);
  if (good.length > 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: drop the §0 block's constraint-widen entirely.
  const mutated1 = migrationSrc.replace(
    /-- §0[\s\S]*?END\s*\n\$\$;\n\nDO \$\$\nDECLARE/,
    "DO $$\nDECLARE"
  );
  const failures1 = analyze(mutated1, overridesRaw);
  if (failures1.length === 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 1 (remove §0 entirely) was not caught");
    process.exit(1);
  }

  // Mutation 2: corrupt the registered override's disk_checksum so it no longer matches the file.
  const mutatedOverrides = overridesRaw.replace(
    '"disk_checksum": "1fcc90adcb6c988a783df8fb7392bc7038ef8ce4166aeadf8582dfddffe30724"',
    '"disk_checksum": "0000000000000000000000000000000000000000000000000000000000000000"'
  );
  if (mutatedOverrides === overridesRaw) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 2 setup failed — target string not found");
    process.exit(1);
  }
  const failures2 = analyze(migrationSrc, mutatedOverrides);
  if (failures2.length === 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: mutation 2 (corrupt override disk_checksum) was not caught");
    process.exit(1);
  }

  console.log("verify-acct-f5684-coa-roles-fresh-db-order-fix --selftest: OK (good files clean, both targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(migrationSrc, overridesRaw);
  if (failures.length > 0) {
    console.error("verify-acct-f5684-coa-roles-fresh-db-order-fix: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-acct-f5684-coa-roles-fresh-db-order-fix: OK — §0 pre-widen present and ordered before the role INSERT, idempotent, checksum-override correctly registered");
}
