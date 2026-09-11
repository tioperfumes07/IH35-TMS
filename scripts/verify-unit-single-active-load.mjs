#!/usr/bin/env node
/**
 * NEW-02 (owner urgent live report 2026-09-07): unit T152 was found double-dispatched — two loads
 * (13572, 13575) both `dispatched` on the same `assigned_unit_id` simultaneously, 5 seconds apart.
 * Root cause: every write path that sets `mdata.loads.assigned_unit_id` (or moves a load's status
 * into the active set while it already carries a unit) skipped checking whether that unit was
 * already active on a DIFFERENT load. This guard asserts every one of the 5 write paths calls the
 * shared `assertUnitNotActiveOnAnotherLoad` helper (apps/backend/src/dispatch/unit-active-load-guard.ts)
 * before its write — a class-sweep, not a one-off patch, so a 6th write path added later without
 * the same call goes red instead of silently reopening this exact bug.
 *
 * This is the application-level backstop. The permanent DB-level backstop (a partial unique index
 * on assigned_unit_id WHERE status IN (...active...) AND soft_deleted_at IS NULL) LANDED as migration
 * 202614042200_loads_one_active_unit_lock.sql (Cursor, #21713, applied live 2026-09-10). This guard
 * now also asserts that migration keeps the index with the correct predicate AND that the index's
 * status set stays in LOCKSTEP with ACTIVE_UNIT_STATUSES — so the app guard and its DB backstop can
 * never silently drift apart (the migration's own comment requires exactly that lockstep).
 *
 * Run: node scripts/verify-unit-single-active-load.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-single-active-load";

const GUARD_FILE = "apps/backend/src/dispatch/unit-active-load-guard.ts";
const MIGRATION_FILE = "db/migrations/202614042200_loads_one_active_unit_lock.sql";

/** Parse the ACTIVE_UNIT_STATUSES string literals out of the guard source so the lockstep check is
 *  driven by the single source of truth, never a re-hardcoded copy that could itself drift. */
function parseActiveStatuses(guardSrc) {
  const block = guardSrc.match(/export const ACTIVE_UNIT_STATUSES\s*=\s*\[([^\]]*)\]/s);
  if (!block) return [];
  return [...block[1].matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);
}

/** file -> the call-site shape that must be present. */
const WRITE_PATHS = [
  {
    file: "apps/backend/src/dispatch/book-load.service.ts",
    label: "book-load create (INSERT)",
    pattern: /assertUnitNotActiveOnAnotherLoad\(\s*client,\s*\{[^}]*unit_id:\s*input\.assigned_unit_id/s,
  },
  {
    file: "apps/backend/src/dispatch/quick-assign.service.ts",
    label: "quick-assign (quickAssignLoad)",
    pattern: /assertUnitNotActiveOnAnotherLoad\(\s*client,\s*\{[^}]*unit_id:\s*input\.unit_id/s,
  },
  {
    file: "apps/backend/src/dispatch/assignments/quicksave.service.ts",
    label: "quicksave reassign (reassignUnit)",
    pattern: /assertUnitNotActiveOnAnotherLoad\(\s*client,\s*\{[^}]*unit_id:\s*input\.unit_uuid/s,
  },
  {
    file: "apps/backend/src/dispatch/update-load.service.ts",
    label: "generic load-edit PATCH (updateDispatchLoad)",
    pattern: /assertUnitNotActiveOnAnotherLoad\(\s*client,\s*\{[^}]*unit_id:\s*effectiveUnitId/s,
  },
  {
    file: "apps/backend/src/mdata/loads.routes.ts",
    label: "office loads PATCH (/api/v1/mdata/loads/:id)",
    pattern: /assertUnitNotActiveOnAnotherLoad\(client,\s*\{[^}]*unit_id:\s*effectiveUnitId/s,
  },
];

function readSources() {
  const sources = { [GUARD_FILE]: fs.readFileSync(path.join(ROOT, GUARD_FILE), "utf8") };
  for (const wp of WRITE_PATHS) sources[wp.file] = fs.readFileSync(path.join(ROOT, wp.file), "utf8");
  sources[MIGRATION_FILE] = fs.readFileSync(path.join(ROOT, MIGRATION_FILE), "utf8");
  return sources;
}

export function audit(sources) {
  const failures = [];

  const guardSrc = sources[GUARD_FILE];
  if (!guardSrc) {
    failures.push(`${GUARD_FILE}: not found`);
    return failures;
  }
  if (!/export const ACTIVE_UNIT_STATUSES/.test(guardSrc)) {
    failures.push(`${GUARD_FILE}: ACTIVE_UNIT_STATUSES export missing`);
  }
  if (!/export (async )?function assertUnitNotActiveOnAnotherLoad/.test(guardSrc)) {
    failures.push(`${GUARD_FILE}: assertUnitNotActiveOnAnotherLoad export missing`);
  }
  if (!/export class UnitAlreadyActiveOnLoadError/.test(guardSrc)) {
    failures.push(`${GUARD_FILE}: UnitAlreadyActiveOnLoadError export missing`);
  }
  // The check must actually filter to active statuses AND exclude soft-deleted rows — a version
  // that dropped either clause would silently widen back to "any load" (false positives storming
  // every edit) or "any status" (missing delivered/cancelled loads, silently narrowing back to a
  // false negative for the exact double-dispatch class this guard exists for).
  if (!/soft_deleted_at IS NULL/.test(guardSrc)) {
    failures.push(`${GUARD_FILE}: query no longer excludes soft_deleted_at IS NULL`);
  }
  if (!/status = ANY\(\$3::mdata\.load_status_enum\[\]\)/.test(guardSrc)) {
    failures.push(`${GUARD_FILE}: query no longer filters to the active status set`);
  }

  for (const wp of WRITE_PATHS) {
    const src = sources[wp.file];
    if (!src) {
      failures.push(`${wp.file}: not found`);
      continue;
    }
    if (!wp.pattern.test(src)) {
      failures.push(`${wp.file} (${wp.label}): does not call assertUnitNotActiveOnAnotherLoad with the expected unit_id before its write`);
    }
  }

  // DB-level backstop (#21713): the partial unique index must exist with the correct predicate, and
  // its status set must stay in lockstep with ACTIVE_UNIT_STATUSES — otherwise the app guard and the
  // DB index could silently diverge (one narrower than the other reopens the double-dispatch class).
  const migSrc = sources[MIGRATION_FILE];
  if (!migSrc) {
    failures.push(`${MIGRATION_FILE}: not found — the DB-level double-dispatch backstop is missing`);
  } else {
    if (!/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_loads_one_active_unit/i.test(migSrc)) {
      failures.push(`${MIGRATION_FILE}: uq_loads_one_active_unit unique index missing (double-dispatch DB backstop removed)`);
    }
    if (!/ON\s+mdata\.loads\s*\(\s*assigned_unit_id\s*\)/i.test(migSrc)) {
      failures.push(`${MIGRATION_FILE}: index no longer keyed ON mdata.loads (assigned_unit_id)`);
    }
    if (!/assigned_unit_id IS NOT NULL/.test(migSrc)) {
      failures.push(`${MIGRATION_FILE}: index predicate no longer requires assigned_unit_id IS NOT NULL`);
    }
    if (!/soft_deleted_at IS NULL/.test(migSrc)) {
      failures.push(`${MIGRATION_FILE}: index predicate no longer excludes soft_deleted_at IS NULL (would lock deleted rows)`);
    }
    const activeStatuses = parseActiveStatuses(guardSrc);
    if (activeStatuses.length === 0) {
      failures.push(`${GUARD_FILE}: could not parse ACTIVE_UNIT_STATUSES for the lockstep check`);
    } else {
      const idxWhere = (migSrc.match(/status\s*=\s*ANY\(ARRAY\[([\s\S]*?)\]/) || [])[1] ?? "";
      for (const st of activeStatuses) {
        if (!new RegExp(`["']${st}["']`).test(idxWhere)) {
          failures.push(`${MIGRATION_FILE}: index status set is out of lockstep with ACTIVE_UNIT_STATUSES — missing '${st}'`);
        }
      }
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  const liveFailures = audit(live);
  if (liveFailures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree not clean:\n  ${liveFailures.join("\n  ")}`);
    process.exit(1);
  }

  // Planted regression: strip the guard's active-status filter (the exact class of bug this
  // exists to catch — silently narrowing back to "any status" would miss T152's own shape).
  const mutatedGuard = live[GUARD_FILE].replace(
    "status = ANY($3::mdata.load_status_enum[])",
    "true"
  );
  if (mutatedGuard === live[GUARD_FILE]) {
    console.error(`${LABEL} SELFTEST FAIL — active-status filter anchor text not found to mutate`);
    process.exit(1);
  }
  if (!audit({ ...live, [GUARD_FILE]: mutatedGuard }).some((f) => f.includes("active status set"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted removal of the active-status filter escaped`);
    process.exit(1);
  }

  // Planted regression: remove the call site from one write path.
  for (const wp of WRITE_PATHS) {
    const mutated = live[wp.file].replace(/assertUnitNotActiveOnAnotherLoad/g, "/* removed */assertUnitNotActiveOnAnotherLoad_REMOVED");
    if (mutated === live[wp.file]) {
      console.error(`${LABEL} SELFTEST FAIL — no assertUnitNotActiveOnAnotherLoad call found to mutate in ${wp.file}`);
      process.exit(1);
    }
    if (!audit({ ...live, [wp.file]: mutated }).some((f) => f.startsWith(wp.file))) {
      console.error(`${LABEL} SELFTEST FAIL — planted removal from ${wp.file} escaped`);
      process.exit(1);
    }
  }

  // Planted regression: drop the DB-level unique index from the migration (removing the backstop).
  const mutatedMig = live[MIGRATION_FILE].replace(/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_loads_one_active_unit/i, "CREATE INDEX IF NOT EXISTS uq_loads_removed");
  if (mutatedMig === live[MIGRATION_FILE]) {
    console.error(`${LABEL} SELFTEST FAIL — uq_loads_one_active_unit anchor not found in migration to mutate`);
    process.exit(1);
  }
  if (!audit({ ...live, [MIGRATION_FILE]: mutatedMig }).some((f) => f.includes("uq_loads_one_active_unit unique index missing"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted removal of the DB unique index escaped`);
    process.exit(1);
  }

  // Planted regression: narrow the index status set (drop 'dispatched') — must trip the lockstep check.
  const mutatedLockstep = live[MIGRATION_FILE].replace(/^\s*'dispatched',\n/m, "");
  if (mutatedLockstep !== live[MIGRATION_FILE] && !audit({ ...live, [MIGRATION_FILE]: mutatedLockstep }).some((f) => f.includes("out of lockstep"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted index/ACTIVE_UNIT_STATUSES drift escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — active-status-filter mutation, all ${WRITE_PATHS.length} write-path removals, DB-index removal, and index lockstep-drift all caught`);
  process.exit(0);
}

const failures = audit(readSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${WRITE_PATHS.length} unit-assignment write paths call assertUnitNotActiveOnAnotherLoad before their write`);
process.exit(0);
