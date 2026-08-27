#!/usr/bin/env node
/**
 * CATALOG-EQUIPMENT-TYPES-AND-DRIVER-LOAD-STATUSES-STALE-SELECT-ALL-RLS-POLICY-DEFEATS-ENTITY-SCOPE
 *
 * catalogs.equipment_types and catalogs.driver_load_statuses were originally global/shared
 * catalogs with an unconditionally-permissive SELECT policy (equipment_types_select_all,
 * dls_select_all — both USING (true)). Both were later converted to per-entity tables with a
 * correctly-scoped company_scope policy added, but neither conversion migration ever DROPPED the
 * original USING (true) policy. Postgres RLS permissive policies are OR'd, so the leftover policy
 * silently granted full cross-entity read access to every row regardless of the GUC — live-proven
 * on prod: setting app.operating_company_id to TRANSP's id returned all 25 equipment_types rows /
 * all 40 driver_load_statuses rows (every entity's), not just TRANSP's own 7/13.
 *
 * Fixed by migration 202613230000, which drops both leftover policies. This guard locks that the
 * migration exists and is never reverted, and that the leaky policy names never reappear in any
 * NEW migration (a future per-entity-conversion migration must not reintroduce the same mistake).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FIX_MIGRATION = "db/migrations/202613230000_drop_stale_select_all_rls_equipment_dls.sql";
const MIGRATIONS_DIR = "db/migrations";
const LEAKY_POLICIES = ["equipment_types_select_all", "dls_select_all"];

export function check(migrationFiles, readFile) {
  const failures = [];

  const fixSrc = readFile(FIX_MIGRATION);
  if (fixSrc === null) {
    failures.push(`${FIX_MIGRATION} is missing — the fix migration must exist and never be deleted`);
    return failures;
  }
  for (const policy of LEAKY_POLICIES) {
    if (!new RegExp(`DROP POLICY IF EXISTS ${policy}\\b`).test(fixSrc)) {
      failures.push(`${FIX_MIGRATION} no longer drops "${policy}"`);
    }
  }

  // No OTHER migration (before or after the fix) may CREATE either leaky policy name again —
  // that would silently reopen the exact same hole a future per-entity conversion could reintroduce.
  for (const file of migrationFiles) {
    if (file === FIX_MIGRATION.split("/").pop()) continue;
    const src = readFile(`${MIGRATIONS_DIR}/${file}`);
    if (src === null) continue;
    for (const policy of LEAKY_POLICIES) {
      if (new RegExp(`CREATE POLICY ${policy}\\b`).test(src) && !new RegExp(`DROP POLICY IF EXISTS ${policy}\\b`).test(src)) {
        // Historical creation (the original 0017/0019 migrations) is fine — that's the documented
        // history this fix corrects. Only flag a NEW migration created after the fix that
        // reintroduces the policy without also dropping it in the same file.
        const isHistorical = file < "202613230000";
        if (!isHistorical) {
          failures.push(`${MIGRATIONS_DIR}/${file}: recreates leaky policy "${policy}" after the fix migration — reopens the cross-entity leak`);
        }
      }
    }
  }

  return failures;
}

function readFileOrNull(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

function run() {
  const migrationFiles = fs.readdirSync(path.join(root, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
  const failures = check(migrationFiles, readFileOrNull);
  if (failures.length > 0) {
    console.error("FAIL: catalog-equipment-dls-no-stale-select-all-policy");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: the leaky equipment_types_select_all/dls_select_all USING(true) SELECT policies are dropped and never reintroduced"
  );
}

function selftest() {
  const migrationFiles = fs.readdirSync(path.join(root, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
  const baseline = check(migrationFiles, readFileOrNull);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: the fix migration no longer exists.
  const failuresA = check(migrationFiles, (rel) => (rel === FIX_MIGRATION ? null : readFileOrNull(rel)));
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (fix migration deleted) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: the fix migration exists but no longer drops one of the two policies.
  const realFixSrc = readFileOrNull(FIX_MIGRATION);
  const offenderFixSrc = realFixSrc.replace("DROP POLICY IF EXISTS dls_select_all ON catalogs.driver_load_statuses;\n", "");
  if (offenderFixSrc === realFixSrc) {
    console.error("FAIL(selftest): offender mutation did not change the fix migration — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(migrationFiles, (rel) => (rel === FIX_MIGRATION ? offenderFixSrc : readFileOrNull(rel)));
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (dls_select_all DROP removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: a new (post-fix-numbered) migration reintroduces the leaky policy.
  const plantedFile = "202699990000_planted_offender_reintroduce_leak.sql";
  const offenderFiles = [...migrationFiles, plantedFile];
  const failuresC = check(offenderFiles, (rel) =>
    rel === `${MIGRATIONS_DIR}/${plantedFile}`
      ? "CREATE POLICY equipment_types_select_all ON catalogs.equipment_types FOR SELECT USING (true);"
      : readFileOrNull(rel)
  );
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (new migration reintroduces equipment_types_select_all) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
