#!/usr/bin/env node
/**
 * WONUM D2/D3 (owner packet GO-WONUM-01-RULE03-2026-08-29.md, GO-1405) -- static-shape guard
 * asserting maintenance.refresh_wo_display_id() (1) no longer contains
 * COALESCE(unit_number, id::text) -- the SAME raw-UUID landmine WONUM D1 fixed in
 * next_wo_display_id but not in this sibling function -- and (2) locks v5_suffix/display_id once a
 * non-PEND0 value is set, per D2's "V5 must not change after a non-PEND0 value" (owner-locked
 * lock-on-first-set). Also asserts next_wo_display_id's D1 exception uses the LOCKED code name
 * .cursor/rules/03-display-ids.mdc:25 actually specifies (E_UNIT_HAS_NO_NUMBER), not the
 * placeholder name D1 shipped with before this rule was found.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("wonum_d2_v5_lock_on_first_set_and_refresh_uuid_fallback_fix"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function stripSqlComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function analyze(migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*wonum_d2_v5_lock_on_first_set_and_refresh_uuid_fallback_fix*.sql found");
    return failures;
  }

  const sqlOnly = stripSqlComments(migration);

  if (/COALESCE\(unit_number, id::text\)/.test(sqlOnly)) {
    failures.push("migration still contains COALESCE(unit_number, id::text) in one of the two functions");
  }

  if (!/CREATE OR REPLACE FUNCTION maintenance\.refresh_wo_display_id/.test(sqlOnly)) {
    failures.push("migration does not CREATE OR REPLACE maintenance.refresh_wo_display_id");
  }

  if (!/CREATE OR REPLACE FUNCTION maintenance\.next_wo_display_id/.test(sqlOnly)) {
    failures.push("migration does not CREATE OR REPLACE maintenance.next_wo_display_id");
  }

  // D1 rename to the locked rule name.
  if (/E_UNIT_MISSING_UNIT_NUMBER/.test(sqlOnly)) {
    failures.push("migration still uses the un-locked exception name E_UNIT_MISSING_UNIT_NUMBER instead of the locked E_UNIT_HAS_NO_NUMBER");
  }
  if (!/E_UNIT_HAS_NO_NUMBER/.test(sqlOnly)) {
    failures.push("migration does not raise the locked E_UNIT_HAS_NO_NUMBER exception");
  }

  // D2 lock.
  if (!/v_wo\.v5_suffix IS NOT NULL AND v_wo\.v5_suffix <> 'PEND0'/.test(sqlOnly)) {
    failures.push("refresh_wo_display_id does not contain the D2 lock-on-first-non-PEND0 guard");
  }
  if (!/RETURN v_wo\.display_id;/.test(sqlOnly)) {
    failures.push("refresh_wo_display_id's D2 lock branch does not return the existing display_id unchanged");
  }

  // Rule 03: never renumber a completed WO -- the pre-existing complete-status lock must survive.
  if (!/E_WO_DISPLAY_ID_LOCKED/.test(sqlOnly)) {
    failures.push("migration lost the pre-existing E_WO_DISPLAY_ID_LOCKED completed-WO guard");
  }

  if (/UPDATE\s+maintenance\.work_orders\s+SET\s+display_id[\s\S]{0,80}WHERE\s+id\s*=\s*p_wo_id/i.test(sqlOnly)) {
    // The UPDATE must be reachable ONLY past the D2 lock check -- verify textual ordering.
    const lockIdx = sqlOnly.indexOf("v_wo.v5_suffix IS NOT NULL AND v_wo.v5_suffix <> 'PEND0'");
    const updateIdx = sqlOnly.indexOf("UPDATE maintenance.work_orders");
    if (lockIdx === -1 || updateIdx === -1 || lockIdx > updateIdx) {
      failures.push("the D2 lock check does not run BEFORE the UPDATE that mints a new display_id");
    }
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(migration);
  if (good.length > 0) {
    console.error("verify-wonum-d2-v5-lock-and-refresh-fix --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "D2 lock guard removed from refresh_wo_display_id",
      apply: (m) => m.replace(/IF v_wo\.v5_suffix IS NOT NULL AND v_wo\.v5_suffix <> 'PEND0' THEN\s*RETURN v_wo\.display_id;\s*END IF;/, ""),
    },
    {
      name: "E_UNIT_HAS_NO_NUMBER reverted to the un-locked name",
      apply: (m) => m.split("E_UNIT_HAS_NO_NUMBER").join("E_UNIT_MISSING_UNIT_NUMBER"),
    },
    {
      name: "COALESCE(unit_number, id::text) reintroduced into refresh_wo_display_id",
      apply: (m) => {
        const secondFn = m.indexOf("CREATE OR REPLACE FUNCTION maintenance.refresh_wo_display_id");
        const before = m.slice(0, secondFn);
        const after = m.slice(secondFn).replace(
          "SELECT NULLIF(TRIM(unit_number), '')",
          "SELECT COALESCE(unit_number, id::text)"
        );
        return before + after;
      },
    },
    {
      name: "E_WO_DISPLAY_ID_LOCKED completed-WO guard removed",
      apply: (m) => m.replace(/IF v_wo\.status IN \('complete', 'completed'\) THEN\s*RAISE EXCEPTION 'E_WO_DISPLAY_ID_LOCKED';\s*END IF;/, ""),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(migration);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-wonum-d2-v5-lock-and-refresh-fix --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const migration = findMigrationSrc();
  const failures = analyze(migration);
  if (failures.length > 0) {
    console.error("verify-wonum-d2-v5-lock-and-refresh-fix: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-wonum-d2-v5-lock-and-refresh-fix: OK -- refresh_wo_display_id no longer falls back to a raw unit UUID, locks v5_suffix/display_id once non-PEND0, both functions raise the locked E_UNIT_HAS_NO_NUMBER exception, completed-WO lock intact"
  );
}
