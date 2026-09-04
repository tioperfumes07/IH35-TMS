#!/usr/bin/env node
/**
 * verify-lane-mileage-short-over-practical-constraint-dropped.mjs
 *
 * LANE-MILEAGE-LIVE-CONSTRAINTS-BLOCK-OWNER-RULING (CC-3 finding 2026-09-04, routed to CC-1).
 * Two live catalogs.lane_mileage constraints blocked a corrected re-import of the owner's real
 * mileage source and contradicted the owner's own 2026-09-04 ruling that short_miles legitimately
 * exceeds practical_miles on the AlwaysTrack-blend rows MILES-INVERT-01 (migration 202613500001)
 * exists to flag, not reject. Migration 202613670001 drops both: practical_miles's NOT NULL, and
 * the lane_mileage_short_miles_not_over_practical CHECK.
 *
 * Source-level regression lock (CI has no reachable Postgres, same frozen-snapshot pattern as
 * every other guard this session). Asserts the migration file exists and does both drops, and
 * that MILES-INVERT-01's trust-flag trigger (which the CHECK constraint contradicted) is still
 * present and unmodified -- confirming this migration doesn't remove the intended replacement
 * mechanism along with the old constraint.
 */
import { readFileSync } from "node:fs";

const DROP_MIGRATION_PATH =
  "db/migrations/202613670001_lane_mileage_drop_practical_notnull_and_short_over_practical_check.sql";
const TRUST_FLAG_MIGRATION_PATH = "db/migrations/202613500001_miles_invert_01_short_miles_trust_flag.sql";

function loadSource(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures(dropMigrationSrc, trustFlagMigrationSrc) {
  const failures = [];

  if (!dropMigrationSrc) {
    failures.push(`${DROP_MIGRATION_PATH} not found -- the constraint-drop migration must exist`);
  } else {
    const stripped = dropMigrationSrc.replace(/--.*$/gm, "");
    if (!/ALTER TABLE catalogs\.lane_mileage\s+ALTER COLUMN practical_miles DROP NOT NULL/i.test(stripped)) {
      failures.push("migration does not drop practical_miles's NOT NULL");
    }
    if (!/ALTER TABLE catalogs\.lane_mileage\s+DROP CONSTRAINT IF EXISTS lane_mileage_short_miles_not_over_practical/i.test(stripped)) {
      failures.push("migration does not drop the lane_mileage_short_miles_not_over_practical CHECK constraint");
    }
  }

  if (!trustFlagMigrationSrc) {
    failures.push(`${TRUST_FLAG_MIGRATION_PATH} not found -- MILES-INVERT-01's trust-flag trigger is the intended replacement for the dropped CHECK; it must still exist`);
  } else if (!/CREATE OR REPLACE FUNCTION catalogs\.recompute_lane_short_miles_trust\(\)/i.test(trustFlagMigrationSrc)) {
    failures.push("MILES-INVERT-01's recompute_lane_short_miles_trust() trigger function is missing -- dropping the old CHECK without this flag mechanism would silently allow untrustworthy data with no signal at all");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const dropSrc = loadSource(DROP_MIGRATION_PATH);
  const trustFlagSrc = loadSource(TRUST_FLAG_MIGRATION_PATH);
  const baseline = collectFailures(dropSrc, trustFlagSrc);
  if (baseline.length) {
    console.error(`verify-lane-mileage-short-over-practical-constraint-dropped SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badDrop1 = dropSrc.replace(
    "ALTER TABLE catalogs.lane_mileage\n  ALTER COLUMN practical_miles DROP NOT NULL;",
    "-- (not dropped)"
  );
  if (badDrop1 === dropSrc || collectFailures(badDrop1, trustFlagSrc).length === 0) {
    escaped.push("practical_miles NOT NULL drop removed from migration");
  }

  const badDrop2 = dropSrc.replace(
    "ALTER TABLE catalogs.lane_mileage\n  DROP CONSTRAINT IF EXISTS lane_mileage_short_miles_not_over_practical;",
    "-- (not dropped)"
  );
  if (badDrop2 === dropSrc || collectFailures(badDrop2, trustFlagSrc).length === 0) {
    escaped.push("CHECK constraint drop removed from migration");
  }

  if (escaped.length) {
    console.error(`verify-lane-mileage-short-over-practical-constraint-dropped SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-lane-mileage-short-over-practical-constraint-dropped SELFTEST PASS — 2/2 plants rejected");
}

const dropSrc = loadSource(DROP_MIGRATION_PATH);
let trustFlagSrc = null;
try {
  trustFlagSrc = loadSource(TRUST_FLAG_MIGRATION_PATH);
} catch {
  // handled by collectFailures via the null branch
}
const failures = collectFailures(dropSrc, trustFlagSrc);
if (failures.length > 0) {
  console.error("verify-lane-mileage-short-over-practical-constraint-dropped: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-lane-mileage-short-over-practical-constraint-dropped: OK — both blocking constraints are dropped, and MILES-INVERT-01's trust-flag replacement mechanism is still in place"
);
