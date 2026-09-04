#!/usr/bin/env node
/**
 * verify-driver-bill-miles-basis-numeric.mjs
 *
 * DRV-BILL-MILES-INTEGER (owner order 2026-09-04, LIVE-BLOCKING). The owner's first real booking
 * (load 13508, miles_shortest=1478.1) threw `invalid input syntax for type integer: "1478.1"`.
 * driver_finance.driver_bills.miles_basis was `integer`, but it holds the MILES QUANTITY (proven
 * live: settlement-contract-terms.service.ts:222 `SUM(db.miles_basis)`), not a type flag -- the
 * type selector is the separate miles_basis_type (text) column on the same table.
 * mdata.loads.miles_shortest/miles_practical/miles_deadhead/loaded_miles are all numeric(10,1),
 * and loads.routes.ts's own Zod schema already publishes `z.number().min(0).multipleOf(0.1)` --
 * decimals are accepted by contract upstream. The driver-bill column never honored that contract.
 *
 * This guard is a source-level regression lock (CI runs with no reachable Postgres, same
 * frozen-snapshot pattern as scripts/verify-invoice-display-id-shape-matches-db-constraint.mjs).
 * It checks THREE things:
 *   1. The widening migration exists and declares `numeric(10,1)` for miles_basis (never leaves it
 *      integer, never narrows it further, e.g. to numeric(10,0)).
 *   2. book-load.service.ts's two driver_bills INSERT sites bind the raw `milesBasis` variable
 *      (not a rounded/truncated copy) into the miles_basis column position.
 *   3. `milesBasis` itself (assigned from `Number(load.miles_shortest ?? 0) || null` /
 *      `Number(load.miles_practical ?? 0) || null`) is never wrapped in Math.round / parseInt /
 *      a `::int`/`::integer` cast anywhere between assignment and the INSERT -- rounding the
 *      MILES quantity (as opposed to the correctly-rounded CENTS rate derived from it) would
 *      silently change what the driver was paid relative to the load it was created from.
 */
import { readFileSync } from "node:fs";

const MIGRATION_PATH = "db/migrations/202613660001_driver_bills_miles_basis_widen_numeric.sql";
const BOOK_LOAD_PATH = "apps/backend/src/dispatch/book-load.service.ts";

function loadSource(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures(migrationSrc, bookLoadSrc) {
  const failures = [];

  if (!migrationSrc) {
    failures.push(`${MIGRATION_PATH} not found -- the widening migration must exist`);
  } else {
    if (!/ALTER\s+TABLE\s+driver_finance\.driver_bills[\s\S]{0,200}?ALTER\s+COLUMN\s+miles_basis\s+TYPE\s+numeric\(10,1\)/i.test(migrationSrc)) {
      failures.push("migration does not ALTER driver_finance.driver_bills.miles_basis TYPE numeric(10,1)");
    }
    if (/miles_basis\s+integer/i.test(migrationSrc.replace(/--.*$/gm, ""))) {
      failures.push("migration text still declares miles_basis as integer somewhere outside a comment");
    }
  }

  if (!bookLoadSrc) {
    failures.push(`${BOOK_LOAD_PATH} not found`);
    return failures;
  }

  // Strip comments so the guard's own explanatory prose (which deliberately names Math.round /
  // parseInt while describing what must NOT happen) never self-triggers a check.
  const stripped = bookLoadSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const milesBasisAssignRe = /let milesBasis: number \| null = null;/;
  if (!milesBasisAssignRe.test(stripped)) {
    failures.push("could not find the milesBasis declaration -- source shape drifted, guard needs review");
  }

  // The two INSERT call sites must bind the bare `milesBasis` identifier as a positional param,
  // never a rounded/truncated derivative (e.g. Math.round(milesBasis), `${milesBasis | 0}`).
  const insertSites = [...stripped.matchAll(/INSERT INTO driver_finance\.driver_bills[\s\S]{0,3500}?\]\s*\n\s*\);/g)];
  if (insertSites.length < 2) {
    failures.push(`expected 2 driver_bills INSERT sites in ${BOOK_LOAD_PATH}, found ${insertSites.length} -- source shape drifted`);
  }
  for (const [i, m] of insertSites.entries()) {
    const block = m[0];
    if (!/,\s*\n\s*milesBasis,/.test(block)) {
      failures.push(`INSERT site #${i + 1} does not bind the bare milesBasis identifier as a VALUES param`);
    }
    if (/Math\.round\(\s*milesBasis\s*\)|parseInt\(\s*milesBasis|milesBasis\s*::\s*int(eger)?/i.test(block)) {
      failures.push(`INSERT site #${i + 1} rounds/casts milesBasis before binding it -- this reintroduces silent pay-changing truncation`);
    }
  }

  // Nothing between the milesShort/milesPrac computation and the INSERT sites may round/truncate
  // the miles quantity itself (Math.round on ratePerMileCents, the CENTS rate, is correct and
  // intentionally NOT flagged here).
  const computeBlockMatch = stripped.match(/const milesShort[\s\S]{0,600}?milesBasisType = "practical";\s*\n\s*}/);
  if (!computeBlockMatch) {
    failures.push("could not find the milesShort/milesPrac -> milesBasis computation block -- source shape drifted");
  } else if (
    /Math\.round\(\s*(Number\(\s*)?milesShort|Math\.round\(\s*(Number\(\s*)?milesPrac|Math\.round\(\s*Number\(load\.miles_shortest|Math\.round\(\s*Number\(load\.miles_practical|parseInt\(\s*milesShort|parseInt\(\s*milesPrac|milesShort\s*::\s*int|milesPrac\s*::\s*int/i.test(
      computeBlockMatch[0]
    )
  ) {
    failures.push("milesShort/milesPrac is rounded or int-cast before becoming milesBasis -- would silently change driver pay");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const migrationSrc = loadSource(MIGRATION_PATH);
  const bookLoadSrc = loadSource(BOOK_LOAD_PATH);
  const baseline = collectFailures(migrationSrc, bookLoadSrc);
  if (baseline.length) {
    console.error(`verify-driver-bill-miles-basis-numeric SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  // Plant 1: the pre-fix migration text (integer, not numeric).
  const badMigration = migrationSrc.replace(
    "ALTER COLUMN miles_basis TYPE numeric(10,1) USING miles_basis::numeric(10,1);",
    "-- (no widen -- miles_basis stays integer)"
  );
  if (badMigration === migrationSrc || collectFailures(badMigration, bookLoadSrc).length === 0) {
    escaped.push("migration reverted to leaving miles_basis integer");
  }

  // Plant 2: round milesBasis before the first INSERT's param binding.
  const roundedInsert = bookLoadSrc.replace(
    "          row.cents,\n          milesBasis,\n          milesBasisType,",
    "          row.cents,\n          Math.round(milesBasis),\n          milesBasisType,"
  );
  if (roundedInsert === bookLoadSrc || collectFailures(migrationSrc, roundedInsert).length === 0) {
    escaped.push("first INSERT site rounds milesBasis before binding");
  }

  // Plant 3: round milesShort at the computation site (a truncation reintroduced upstream).
  const roundedCompute = bookLoadSrc.replace(
    "const milesShort = Number(load.miles_shortest ?? 0) || null;",
    "const milesShort = Math.round(Number(load.miles_shortest ?? 0)) || null;"
  );
  if (roundedCompute === bookLoadSrc || collectFailures(migrationSrc, roundedCompute).length === 0) {
    escaped.push("milesShort computation rounds the decimal before it becomes milesBasis");
  }

  if (escaped.length) {
    console.error(`verify-driver-bill-miles-basis-numeric SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-driver-bill-miles-basis-numeric SELFTEST PASS — 3/3 plants rejected");
}

let migrationSrc = null;
try {
  migrationSrc = loadSource(MIGRATION_PATH);
} catch {
  // handled by collectFailures via the null branch
}
const bookLoadSrc = loadSource(BOOK_LOAD_PATH);
const failures = collectFailures(migrationSrc, bookLoadSrc);
if (failures.length > 0) {
  console.error("verify-driver-bill-miles-basis-numeric: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-driver-bill-miles-basis-numeric: OK — driver_finance.driver_bills.miles_basis is widened to numeric(10,1) and both INSERT sites bind the unrounded miles quantity"
);
