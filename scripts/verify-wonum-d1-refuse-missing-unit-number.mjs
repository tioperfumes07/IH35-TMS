#!/usr/bin/env node
/**
 * WONUM D1 (owner packet IH35-FINISH-2026-08-29/CC-1, GO-1405) -- static-shape guard asserting
 * maintenance.next_wo_display_id() no longer silently bakes a raw unit UUID into a new work-order
 * number when a unit has no real unit_number. Live-confirmed the original function did
 * SELECT COALESCE(unit_number, id::text) INTO v_unit_display_id -- if a unit's unit_number were
 * ever NULL/blank, the WO number would read "WO-<uuid>-..." instead of refusing creation.
 *
 * Rule 03: this migration only changes the FUTURE-facing function, no UPDATE on
 * maintenance.work_orders -- never renumbers an already-completed WO.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("wonum_d1_next_wo_display_id_refuse_missing_unit_number"));
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
    failures.push("no db/migrations/*wonum_d1_next_wo_display_id_refuse_missing_unit_number*.sql found");
    return failures;
  }

  const sqlOnly = stripSqlComments(migration);

  if (/COALESCE\(unit_number, id::text\)/.test(sqlOnly)) {
    failures.push("migration still contains COALESCE(unit_number, id::text) -- the raw-UUID fallback was not removed");
  }

  if (!/CREATE OR REPLACE FUNCTION maintenance\.next_wo_display_id/.test(sqlOnly)) {
    failures.push("migration does not CREATE OR REPLACE maintenance.next_wo_display_id");
  }

  if (!/E_UNIT_MISSING_UNIT_NUMBER/.test(sqlOnly)) {
    failures.push("migration does not raise a distinct E_UNIT_MISSING_UNIT_NUMBER exception");
  }

  if (!/E_UNIT_NOT_FOUND/.test(sqlOnly)) {
    failures.push("migration lost the pre-existing E_UNIT_NOT_FOUND check (unit not found for this company)");
  }

  if (!/IF NOT FOUND THEN/.test(sqlOnly)) {
    failures.push("migration does not distinguish 'no row found' (FOUND) from 'row found but unit_number empty' (NULL result) -- collapsing them back into one check reintroduces the original bug's ambiguity");
  }

  // Rule 03: must never UPDATE existing work_orders rows.
  if (/UPDATE\s+maintenance\.work_orders/i.test(sqlOnly)) {
    failures.push("migration UPDATEs maintenance.work_orders -- Rule 03 forbids renumbering already-completed WOs");
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(migration);
  if (good.length > 0) {
    console.error("verify-wonum-d1-refuse-missing-unit-number --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "COALESCE(unit_number, id::text) reintroduced",
      apply: (m) =>
        m.replace(
          "SELECT NULLIF(TRIM(unit_number), '')",
          "SELECT COALESCE(unit_number, id::text)"
        ),
    },
    {
      name: "E_UNIT_MISSING_UNIT_NUMBER exception removed",
      apply: (m) => m.replace(/RAISE EXCEPTION 'E_UNIT_MISSING_UNIT_NUMBER[^;]*;/, ""),
    },
    {
      name: "E_UNIT_NOT_FOUND check removed",
      apply: (m) => m.replace(/IF NOT FOUND THEN\s*RAISE EXCEPTION 'E_UNIT_NOT_FOUND[^;]*;\s*END IF;/, ""),
    },
    {
      name: "renumbers existing work_orders (Rule 03 violation)",
      apply: (m) => m + "\nUPDATE maintenance.work_orders SET display_id = 'x';",
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(migration);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-wonum-d1-refuse-missing-unit-number --selftest: NOT CAUGHT -- ${m.name}`);
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
    console.error("verify-wonum-d1-refuse-missing-unit-number: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-wonum-d1-refuse-missing-unit-number: OK -- next_wo_display_id() no longer falls back to a raw unit UUID; refuses creation with E_UNIT_MISSING_UNIT_NUMBER when unit_number is empty, distinct from E_UNIT_NOT_FOUND; no existing work_orders rows touched"
  );
}
