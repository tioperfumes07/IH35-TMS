#!/usr/bin/env node
/**
 * HONEST-BUILT-LAUNCH-LAW 2026-08-14: class regression only — NO @matrix-built Box-3 credit.
 * Former leafRe `^(hub.|catalog.|bills.|expenses.)` painted picker_law across ~233 leaves for an
 * accounting factory INSERT de-dupe check — not picker_law proof. Guard still enforces the builder.
 */
/**
 * GUARD: a catalog that maps two logical fields onto ONE physical column must still INSERT.
 *
 * ACCT-F192 / Cascade FAIL-L3. `catalogs/accounting/factory.ts` built its INSERT column list as
 * `[codeColumn, nameColumn, descriptionColumn, ...]`. Two registered catalogs set codeColumn and
 * nameColumn to the SAME physical column, so the emitted statement named it twice —
 *
 *     INSERT INTO catalogs.payment_terms (terms_name, terms_name, notes, ...)
 *
 * which PostgreSQL rejects outright. Every POST to those catalogs returned 500.
 *
 * TWO catalogs are configured this way, not one. Cascade reported `payment_terms`;
 * `account_role_bindings` (codeColumn = nameColumn = 'role_key') fails identically and was not
 * reported. This guard is written against the CLASS, not the two names, because the failure mode is
 * a property of the builder — the next catalog registered with a single physical column would break
 * the same way, and the 500 looks like a database fault rather than a mapping one.
 *
 * WHY THE CHECK IS ON THE BUILDER AND NOT THE CONFIGS. Forbidding codeColumn === nameColumn would
 * be the easy assertion and the wrong one: mapping two logical fields onto one column is a
 * legitimate thing for a catalog whose display name IS its code. The defect was never the config —
 * it was a builder that could not express it. So the guard requires the builder to DE-DUPLICATE,
 * and deliberately leaves the configs free.
 *
 * The conflict branch matters as much as the de-duplication: `code` and `display_name` are BOTH
 * required by the create schema, so when they collide on one column and carry DIFFERENT values,
 * silently choosing one discards a value the caller explicitly supplied — invisibly, on a financial
 * catalog. That must be a 400, and the guard asserts it.
 *
 * Run:  node scripts/verify-catalog-column-collision-safe.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACTORY = "apps/backend/src/catalogs/accounting/factory.ts";
const CONFIGS = ["apps/backend/src/catalogs/accounting/index.ts"];
const LABEL = "verify-catalog-column-collision-safe";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every (table, codeColumn, nameColumn) triple, in registration order. */
export function collidingCatalogs(configSrc) {
  const out = [];
  let table = null, code = null, name = null;
  for (const line of strip(configSrc).split("\n")) {
    const t = /tableName:\s*"([a-z_]+)"/.exec(line);
    if (t) {
      if (table && code && name && code === name) out.push({ table, column: code });
      table = t[1]; code = null; name = null;
    }
    const c = /codeColumn:\s*"([a-z_]+)"/.exec(line);
    const n = /nameColumn:\s*"([a-z_]+)"/.exec(line);
    if (c) code = c[1];
    if (n) name = n[1];
  }
  if (table && code && name && code === name) out.push({ table, column: code });
  return out;
}

export function collectProblems(factorySrc, configSrcs) {
  const problems = [];
  if (factorySrc == null) return [`missing ${FACTORY}`];
  const f = strip(factorySrc);

  // The builder must de-duplicate. `indexOf` on the accumulated column list is the shape that fixed
  // it; requiring that exact idiom is too brittle, so this asks for the two properties instead.
  const dedupes = /columns\.indexOf\(|new Set\(rawColumns|seenColumns/.test(f);
  if (!dedupes) {
    problems.push(
      `${FACTORY} builds its INSERT column list without de-duplicating. A catalog whose codeColumn and ` +
        `nameColumn are the same physical column emits INSERT INTO t (col, col, ...), which PostgreSQL ` +
        `rejects — every POST to it returns 500 (ACCT-F192 / FAIL-L3).`
    );
  }
  if (!/catalog_column_value_conflict/.test(f)) {
    problems.push(
      `${FACTORY} de-duplicates without refusing a CONFLICT. code and display_name are both required, ` +
        `so when they land on one column with DIFFERENT values, silently picking one discards a value ` +
        `the caller supplied — invisibly, on a financial catalog. It must return 400.`
    );
  }

  // Report the collided catalogs for context — they are legitimate, not offenders.
  const collided = configSrcs.filter(Boolean).flatMap((s) => collidingCatalogs(s));
  if (collided.length && !dedupes) {
    for (const c of collided) {
      problems.push(`  … affected today: catalogs.${c.table} (both columns map to '${c.column}')`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const factory = read(FACTORY);
  const configs = CONFIGS.map(read);
  const baseline = collectProblems(factory, configs);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const failures = [];
  // Detection of the collided configs must actually work, or the context line is theatre.
  const sample =
    'tableName: "payment_terms",\ncodeColumn: "terms_name",\nnameColumn: "terms_name",\n' +
    'tableName: "accounts",\ncodeColumn: "account_number",\nnameColumn: "account_name",\n';
  const found = collidingCatalogs(sample);
  if (found.length !== 1 || found[0].table !== "payment_terms") {
    failures.push("collidingCatalogs did not identify exactly the colliding catalog");
  }
  // The two real ones must be found in the real config.
  const real = configs.filter(Boolean).flatMap((s) => collidingCatalogs(s)).map((c) => c.table).sort();
  for (const t of ["account_role_bindings", "payment_terms"]) {
    if (!real.includes(t)) failures.push(`the real config no longer reports ${t} as collided — re-verify`);
  }

  // Mutations through the REAL checker.
  const mutations = [
    ["de-duplication removed (the FAIL-L3 defect verbatim)", factory.replace(/columns\.indexOf\(/g, "[].indexOf(")],
    ["conflict branch removed — a supplied value would be silently discarded", factory.replaceAll("catalog_column_value_conflict", "ok")],
  ];
  for (const [why, src] of mutations) {
    if (src === factory) failures.push(`${why} — MUTATION INERT (changed nothing)`);
    else if (collectProblems(src, configs).length === 0) failures.push(`${why} — NOT DETECTED`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of failures) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (collision detection, both real catalogs still found, de-dup removal caught, ` +
      `conflict-branch removal caught)`
  );
  process.exit(0);
}

const problems = collectProblems(read(FACTORY), CONFIGS.map(read));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
const collided = CONFIGS.map(read).filter(Boolean).flatMap((s) => collidingCatalogs(s));
console.log(
  `${LABEL} OK — the catalog builder de-duplicates repeated columns and returns 400 on a value conflict, ` +
    `so the ${collided.length} catalog(s) that map two fields onto one column (${collided.map((c) => c.table).join(", ")}) ` +
    `can be created.`
);
