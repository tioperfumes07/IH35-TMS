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
// LEAD 443.209 (2026-10-21) — old rule -> new rule -> why:
//   OLD: the DB backstop was uq_loads_one_active_unit (202614042200).
//   NEW: the DB backstop is the DEFERRED constraint trigger trg_refuse_second_active_load_on_unit (202616050700): one
//   active load per unit except the same tour's sequential leg (13688 -> 13694), the app gate's exact rule. The index is
//   dropped there (it was already absent on prod, which ran an untracked date-window trigger instead).
//   WHY: a unique index cannot express "the same tour's next leg"; it refused the legitimate 13694 on every fresh DB.
const BACKSTOP_FILE = "db/migrations/202616150100_truck_one_in_motion_plus_advance_bookings.sql"; // LEAD 443.244: in-motion set

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
  sources[BACKSTOP_FILE] = fs.existsSync(path.join(ROOT, BACKSTOP_FILE)) ? fs.readFileSync(path.join(ROOT, BACKSTOP_FILE), "utf8") : "";
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
  const migSrc = sources[BACKSTOP_FILE];
  if (!migSrc) {
    failures.push(`${BACKSTOP_FILE}: not found — the DB-level double-dispatch backstop is missing`);
  } else {
    if (!/CREATE CONSTRAINT TRIGGER trg_refuse_second_active_load_on_unit[\s\S]*?DEFERRABLE INITIALLY DEFERRED[\s\S]*?EXECUTE FUNCTION mdata\.refuse_second_active_load_on_unit\(\)/.test(migSrc)) {
      failures.push(`${BACKSTOP_FILE}: trg_refuse_second_active_load_on_unit (deferred) missing (double-dispatch DB backstop removed)`);
    }
    if (!/AFTER INSERT OR UPDATE OF assigned_unit_id, status, soft_deleted_at, tour_id ON mdata\.loads/.test(migSrc)) {
      failures.push(`${BACKSTOP_FILE}: the backstop no longer fires on unit / status / soft-delete / tour changes`);
    }
    if (!/PERFORM pg_advisory_xact_lock\(hashtext\('mdata\.loads\.unit:' \|\| cur\.assigned_unit_id::text\)\)/.test(migSrc)) {
      failures.push(`${BACKSTOP_FILE}: the backstop no longer serializes per unit (two concurrent bookings could both pass)`);
    }
    if (!/AND NOT mdata\.unit_legs_are_same_tour_sequential\(l\.id, cur\.id\)/.test(migSrc)) {
      failures.push(`${BACKSTOP_FILE}: the only exception is no longer the same-tour sequential leg`);
    }
    const activeStatuses = parseActiveStatuses(guardSrc);
    if (activeStatuses.length === 0) {
      failures.push(`${GUARD_FILE}: could not parse ACTIVE_UNIT_STATUSES for the lockstep check`);
    } else {
      const fn = (migSrc.match(/FUNCTION mdata\.refuse_second_active_load_on_unit\(\)[\s\S]*?\$function\$;/) || [])[0] ?? "";
      const sets = [...fn.matchAll(/status::text (?:NOT )?IN \(([^)]*)\)/g)].map((m) => m[1]);
      if (sets.length < 2) failures.push(`${BACKSTOP_FILE}: could not find the backstop's active status sets`);
      for (const set of sets) for (const st of activeStatuses) {
        if (!new RegExp(`'${st}'`).test(set)) failures.push(`${BACKSTOP_FILE}: backstop status set is out of lockstep with ACTIVE_UNIT_STATUSES — missing '${st}'`);
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

  // Planted regression: remove the deferred DB backstop.
  const mutatedMig = live[BACKSTOP_FILE].replace("CREATE CONSTRAINT TRIGGER trg_refuse_second_active_load_on_unit", "CREATE TRIGGER trg_removed");
  if (mutatedMig === live[BACKSTOP_FILE] || !audit({ ...live, [BACKSTOP_FILE]: mutatedMig }).some((f) => f.includes("backstop removed"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted removal of the DB backstop escaped`);
    process.exit(1);
  }
  // Planted regression: narrow the backstop status set (drop 'dispatched') — must trip the lockstep check.
  const mutatedLockstep = live[BACKSTOP_FILE].replace("'dispatched','at_pickup','in_transit'", "'at_pickup','in_transit'");
  if (mutatedLockstep === live[BACKSTOP_FILE] || !audit({ ...live, [BACKSTOP_FILE]: mutatedLockstep }).some((f) => f.includes("out of lockstep"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted backstop/ACTIVE_UNIT_STATUSES drift escaped`);
    process.exit(1);
  }
  // Planted regression: no per-unit serialization.
  const mutatedLock = live[BACKSTOP_FILE].replace("PERFORM pg_advisory_xact_lock(hashtext('mdata.loads.unit:' || cur.assigned_unit_id::text));", "");
  if (mutatedLock === live[BACKSTOP_FILE] || !audit({ ...live, [BACKSTOP_FILE]: mutatedLock }).some((f) => f.includes("serializes"))) {
    console.error(`${LABEL} SELFTEST FAIL — planted removal of the per-unit lock escaped`);
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
