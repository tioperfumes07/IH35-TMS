#!/usr/bin/env node
/**
 * LOADS-MILEAGE-INTEGER-TRUNCATION — static-shape guard.
 *
 * Board row (Codex 2026-08-30, REV-E row 014): mdata.loads.loaded_miles/miles_practical/
 * miles_shortest/miles_deadhead were `integer` while AlwaysTrack carries tenths of a mile.
 * Migration 202613310000 widens all 4 to numeric(10,1); this guard asserts (1) that migration
 * exists and touches exactly those 4 columns with the exact target type, and (2) the two Zod
 * schemas in loads.routes.ts (create + edit) that gate miles_practical/miles_shortest/miles_deadhead
 * no longer force-round to `.int()` — they must accept one decimal place (`.multipleOf(0.1)`)
 * instead, matching the widened column precision exactly.
 */
import { readFileSync, existsSync } from "node:fs";

const FILES = {
  migration: "db/migrations/202613310000_loads_mileage_columns_numeric_widen.sql",
  routes: "apps/backend/src/dispatch/loads.routes.ts",
};

const MILEAGE_FIELDS = ["loaded_miles", "miles_practical", "miles_shortest", "miles_deadhead"];

function analyze(src) {
  const failures = [];

  if (!src.migration) {
    failures.push(`${FILES.migration}: file does not exist`);
    return failures;
  }
  for (const col of MILEAGE_FIELDS) {
    const re = new RegExp(`ALTER COLUMN ${col} TYPE numeric\\(10,1\\) USING ${col}::numeric\\(10,1\\)`);
    if (!re.test(src.migration)) {
      failures.push(`${FILES.migration}: missing "ALTER COLUMN ${col} TYPE numeric(10,1) USING ${col}::numeric(10,1)"`);
    }
  }

  // The create (miles_*: z.number()...optional()) and edit (miles_*: z.number()...nullable().optional())
  // schemas both must accept one decimal place, not force an integer.
  for (const field of ["miles_practical", "miles_shortest", "miles_deadhead"]) {
    const intRe = new RegExp(`${field}: z\\.number\\(\\)\\.int\\(\\)`);
    if (intRe.test(src.routes)) {
      failures.push(`${FILES.routes}: ${field} still declares z.number().int() — forces rounding, defeats the numeric(10,1) widen`);
    }
    const createRe = new RegExp(`${field}: z\\.number\\(\\)\\.min\\(0\\)\\.multipleOf\\(0\\.1\\)\\.optional\\(\\)`);
    const editRe = new RegExp(`${field}: z\\.number\\(\\)\\.min\\(0\\)\\.multipleOf\\(0\\.1\\)\\.nullable\\(\\)\\.optional\\(\\)`);
    if (!createRe.test(src.routes) && !editRe.test(src.routes)) {
      failures.push(`${FILES.routes}: ${field} does not declare the expected multipleOf(0.1) shape in either schema`);
    }
  }
  // Both shapes (create's bare .optional() and edit's .nullable().optional()) must each appear once.
  const createCount = (src.routes.match(/miles_(practical|shortest|deadhead): z\.number\(\)\.min\(0\)\.multipleOf\(0\.1\)\.optional\(\)/g) || []).length;
  const editCount = (src.routes.match(/miles_(practical|shortest|deadhead): z\.number\(\)\.min\(0\)\.multipleOf\(0\.1\)\.nullable\(\)\.optional\(\)/g) || []).length;
  if (createCount !== 3) {
    failures.push(`${FILES.routes}: expected exactly 3 create-schema multipleOf(0.1) mileage fields, found ${createCount}`);
  }
  if (editCount !== 3) {
    failures.push(`${FILES.routes}: expected exactly 3 edit-schema multipleOf(0.1) mileage fields, found ${editCount}`);
  }

  return failures;
}

function readAll() {
  return {
    migration: existsSync(FILES.migration) ? readFileSync(FILES.migration, "utf8") : null,
    routes: readFileSync(FILES.routes, "utf8"),
  };
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-loads-mileage-columns-numeric-precision --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration drops the miles_shortest ALTER COLUMN",
      apply: (s) => ({
        ...s,
        migration: s.migration.replace(
          "  ALTER COLUMN miles_shortest TYPE numeric(10,1) USING miles_shortest::numeric(10,1),\n",
          ""
        ),
      }),
    },
    {
      name: "create schema regresses miles_practical back to z.number().int()",
      apply: (s) => ({
        ...s,
        routes: s.routes.replace(
          "miles_practical: z.number().min(0).multipleOf(0.1).optional(),",
          "miles_practical: z.number().int().min(0).optional(),"
        ),
      }),
    },
    {
      name: "edit schema regresses miles_deadhead back to z.number().int()",
      apply: (s) => ({
        ...s,
        routes: s.routes.replace(
          "miles_deadhead: z.number().min(0).multipleOf(0.1).nullable().optional(),",
          "miles_deadhead: z.number().int().min(0).nullable().optional(),"
        ),
      }),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-loads-mileage-columns-numeric-precision --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-loads-mileage-columns-numeric-precision: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-loads-mileage-columns-numeric-precision: OK -- migration 202613310000 widens all 4 mileage columns to numeric(10,1); both Zod schemas accept one decimal place instead of forcing an integer round"
  );
}
