#!/usr/bin/env node
/**
 * verify-cc3-ddl-handoff-retention-leave-safety.mjs
 *
 * CC-3 DDL handoff (owner 2026-09-03/09-04): CC-3 had no UPDATE/DELETE grant on
 * drivers.retention_scores, and catalogs.driver_leave_balances / safety.driver_safety_scores had
 * no way to void a duplicate row without deleting it. The migration file is the source of truth;
 * this guard asserts its shape so a future edit can't silently drop the grant or the columns.
 */
import { readFileSync } from "node:fs";

const MIGRATION_PATH =
  "db/migrations/202613620001_cc3_ddl_handoff_retention_grant_leave_safety_deactivated_at.sql";

function loadSource() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drivers\.retention_scores TO ih35_app/.test(src)) {
    failures.push("drivers.retention_scores GRANT to ih35_app is missing or narrower than SELECT/INSERT/UPDATE/DELETE");
  }
  if (!/ALTER TABLE catalogs\.driver_leave_balances\s*\n\s*ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL/.test(src)) {
    failures.push("catalogs.driver_leave_balances.deactivated_at is missing");
  }
  if (!/ALTER TABLE safety\.driver_safety_scores\s*\n\s*ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL/.test(src)) {
    failures.push("safety.driver_safety_scores.deactivated_at is missing");
  }
  // VOID-COLUMN CONVENTION: this migration must never add a deleted_at column (retired convention).
  if (/\bdeleted_at\b/.test(src)) {
    failures.push("migration references deleted_at -- retired per the VOID-COLUMN CONVENTION law, use deactivated_at");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-cc3-ddl-handoff-retention-leave-safety SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    [
      "grant narrowed to SELECT only",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drivers.retention_scores TO ih35_app;",
      "GRANT SELECT ON TABLE drivers.retention_scores TO ih35_app;",
    ],
    [
      "leave_balances deactivated_at removed",
      "ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,\n  ADD COLUMN IF NOT EXISTS deactivated_reason text NULL,\n  ADD COLUMN IF NOT EXISTS deactivated_by_user_id uuid NULL REFERENCES identity.users(id);\n\nALTER TABLE safety.driver_safety_scores",
      "ALTER TABLE safety.driver_safety_scores",
    ],
    ["deleted_at reintroduced", "-- 202613620001", "-- deleted_at 202613620001"],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-cc3-ddl-handoff-retention-leave-safety SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-cc3-ddl-handoff-retention-leave-safety SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-cc3-ddl-handoff-retention-leave-safety: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cc3-ddl-handoff-retention-leave-safety: OK — drivers.retention_scores has the full CRUD grant, catalogs.driver_leave_balances and safety.driver_safety_scores both carry deactivated_at, no deleted_at introduced");
