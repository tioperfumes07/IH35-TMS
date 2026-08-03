#!/usr/bin/env node
/**
 * GUARD — WO-CREATE: maintenance.next_wo_display_id's RETURN SHAPE must match how every caller reads it.
 *
 * WHY THIS GUARD AND NOT A MIGRATION. The 2026-08-03 handoff listed this as an open DB defect:
 * "maintenance.next_wo_display_id doesn't return TABLE(display_id, sequence) → pg 42703 on every WO
 * create. DROP the stale + CREATE the table-returning version." That premise was checked against the
 * PROD branch before any SQL was written, and it is FALSE — prod already has:
 *     maintenance.next_wo_display_id(p_unit_id uuid, p_source_type text, p_date date, p_op_co_id uuid)
 *       RETURNS TABLE(display_id text, sequence integer)
 * and all eight callers already do `SELECT display_id, sequence FROM maintenance.next_wo_display_id(...)`.
 * Dropping and recreating a function that is already correct is churn with a real downside — a DROP
 * against a live function used by eight WO-creation paths — for zero gain. Prod wins over a document.
 *
 * WHAT IS ACTUALLY MISSING is the other half the handoff asked for: the CI guard tying the function's
 * return shape to the service SELECT. Nothing enforced that agreement, which is exactly why the drift
 * was believable. This is that guard.
 *
 * THE FAILURE IT PREVENTS. If someone redefines the function to RETURNS text (the shape
 * maintenance.refresh_wo_display_id genuinely has, one identifier away), every caller's
 * `SELECT display_id, sequence FROM ...` starts raising 42703 "column does not exist" — at WO-CREATE
 * time, on DVIR follow-ups, accident WOs, PM auto-engine, DTC and Samsara fault-code paths. A truck's
 * work order silently fails to open. This is a compile-clean, test-clean, deploy-clean failure: nothing
 * in TypeScript knows the shape of a Postgres function.
 *
 * IT CHECKS THE LATEST DEFINITION, NOT THE FIRST. Two migrations define this function (0049, then
 * 202607051000). A guard reading the earlier one would go green while the live definition drifted, so
 * definitions are ordered by migration filename and the LAST one wins — the same order the migration
 * runner applies them in.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:wo-display-id-return-shape";
const MIGRATIONS_DIR = "db/migrations";
const BACKEND_DIR = "apps/backend/src";
const FN = "maintenance.next_wo_display_id";

/** The columns every caller selects, and therefore the columns the function must return. */
export const REQUIRED_COLUMNS = ["display_id", "sequence"];

export function stripSqlComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/**
 * The RETURNS clause of the LAST migration that defines the function.
 * `sources` is an ordered [filename, sql][] — order is the caller's responsibility and is asserted.
 */
export function latestReturnClause(sources) {
  let latest = null;
  for (const [file, sql] of sources) {
    if (sql == null) continue;
    const body = stripSqlComments(sql);
    // CREATE [OR REPLACE] FUNCTION maintenance.next_wo_display_id( ... ) RETURNS <clause>
    const re = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${FN.replace(".", "\\.")}\\s*\\([\\s\\S]*?\\)\\s*RETURNS\\s+([^\\n]+)`,
      "gi"
    );
    let m;
    while ((m = re.exec(body)) !== null) latest = { file, returns: m[1].trim() };
  }
  return latest;
}

/** Every non-test backend file that selects from the function, with what it selects. */
export function findCallers(backendSources) {
  const callers = [];
  for (const [file, src] of Object.entries(backendSources)) {
    if (src == null) continue;
    if (!src.includes(FN)) continue;
    // The SELECT list immediately preceding `FROM maintenance.next_wo_display_id(`.
    const re = new RegExp(`SELECT\\s+([\\s\\S]{0,200}?)\\s+FROM\\s+${FN.replace(".", "\\.")}\\s*\\(`, "gi");
    let m;
    let matched = false;
    while ((m = re.exec(src)) !== null) {
      matched = true;
      callers.push({ file, selectList: m[1].replace(/\s+/g, " ").trim() });
    }
    // Referenced but not through a SELECT ... FROM — the function is table-returning, so any other
    // call form (e.g. `SELECT maintenance.next_wo_display_id(...)`) yields a record column, not the
    // two named columns, and is a defect in its own right.
    if (!matched) callers.push({ file, selectList: null });
  }
  return callers;
}

export function analyse(migrationSources, backendSources) {
  const problems = [];

  const latest = latestReturnClause(migrationSources);
  if (!latest) {
    problems.push(
      `no CREATE FUNCTION ${FN} found under ${MIGRATIONS_DIR}. Either the function was removed — which ` +
        `breaks every WO-creation path — or this guard's detection rotted and is protecting nothing.`
    );
    return problems;
  }

  const returns = latest.returns.toLowerCase();
  if (!returns.startsWith("table")) {
    problems.push(
      `${latest.file}: ${FN} RETURNS ${latest.returns}, not a TABLE. Every caller reads it as ` +
        `SELECT display_id, sequence FROM ${FN}(...), which raises Postgres 42703 against a scalar ` +
        `return — WO creation fails at runtime while TypeScript, tests and deploy all stay green.`
    );
  } else {
    for (const col of REQUIRED_COLUMNS) {
      if (!new RegExp(`\\b${col}\\b`).test(returns)) {
        problems.push(
          `${latest.file}: ${FN} returns ${latest.returns}, which does not include "${col}". Callers ` +
            `select it by name; a missing column is a 42703 at WO-create time, not a compile error.`
        );
      }
    }
  }

  const callers = findCallers(backendSources);
  if (callers.length === 0) {
    problems.push(
      `no backend caller of ${FN} found. The function generates the immutable WO display ID; if nothing ` +
        `calls it, either WO creation stopped using it or this guard stopped seeing the callers.`
    );
  }
  for (const { file, selectList } of callers) {
    if (selectList == null) {
      problems.push(
        `${file}: references ${FN} but not as SELECT ... FROM ${FN}(...). A table-returning function ` +
          `called any other way yields a single record column, not display_id/sequence.`
      );
      continue;
    }
    for (const col of REQUIRED_COLUMNS) {
      if (!new RegExp(`\\b${col}\\b`).test(selectList)) {
        problems.push(
          `${file}: selects "${selectList}" from ${FN} — missing "${col}". The caller and the function ` +
            `must agree on every column name or the query raises 42703 in production.`
        );
      }
    }
  }

  return problems;
}

function walk(dir, out = [], filter = () => true) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full, out, filter);
    } else if (filter(entry.name)) out.push(full);
  }
  return out;
}

function readAll() {
  // Ordered by filename — the same order the migration runner applies, so "latest" means latest.
  const migrationFiles = walk(MIGRATIONS_DIR, [], (n) => n.endsWith(".sql")).sort();
  const migrationSources = migrationFiles.map((f) => [f, readFileSync(f, "utf8")]);

  const backendSources = {};
  for (const f of walk(BACKEND_DIR, [], (n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    backendSources[f] = readFileSync(f, "utf8");
  }
  return { migrationSources, backendSources };
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  const goodMig = `CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(
  p_unit_id uuid, p_source_type text, p_date date, p_op_co_id uuid
) RETURNS TABLE(display_id text, sequence int) LANGUAGE plpgsql AS $$ BEGIN END $$;`;
  const goodCaller = { "a/svc.ts": "SELECT display_id, sequence\n FROM maintenance.next_wo_display_id($1::uuid, 'PM', CURRENT_DATE, $2::uuid)" };

  t("the real shape passes", analyse([["0049.sql", goodMig]], goodCaller).length === 0);

  // THE EXACT DEFECT THE HANDOFF DESCRIBED — a scalar return against table-shaped callers.
  t("RETURNS text (scalar) FAILS",
    analyse([["0049.sql", goodMig.replace("TABLE(display_id text, sequence int)", "text")]], goodCaller).length >= 1);

  t("a TABLE missing the sequence column FAILS",
    analyse([["0049.sql", goodMig.replace("TABLE(display_id text, sequence int)", "TABLE(display_id text)")]], goodCaller).length >= 1);

  t("a caller that drops a column FAILS",
    analyse([["0049.sql", goodMig]], { "a/svc.ts": "SELECT display_id FROM maintenance.next_wo_display_id($1,$2,$3,$4)" }).length >= 1);

  t("a caller not using SELECT ... FROM FAILS",
    analyse([["0049.sql", goodMig]], { "a/svc.ts": "const x = await q('SELECT maintenance.next_wo_display_id($1,$2,$3,$4)')" }).length >= 1);

  t("no function definition FAILS",
    analyse([["0049.sql", "-- nothing here"]], goodCaller).length === 1);

  t("no caller at all FAILS", analyse([["0049.sql", goodMig]], {}).length >= 1);

  // ORDERING: a LATER migration that breaks the shape must win over an earlier correct one. Reading
  // the first definition would go green while the live function drifted.
  const brokenLater = goodMig.replace("TABLE(display_id text, sequence int)", "text");
  t("a LATER migration breaking the shape FAILS (latest definition wins)",
    analyse([["0049.sql", goodMig], ["202607051000.sql", brokenLater]], goodCaller).length >= 1);
  t("a later migration RESTORING the shape passes",
    analyse([["0049.sql", brokenLater], ["202607051000.sql", goodMig]], goodCaller).length === 0);

  // A commented-out definition must not be read as the live one.
  t("a commented-out definition is ignored",
    analyse([["0049.sql", goodMig], ["202607051000.sql", `-- ${brokenLater.replace(/\n/g, "\n-- ")}`]], goodCaller).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 10 cases (3 pass-shapes, 7 fail-shapes incl. the scalar-return defect and latest-definition ordering)`);
  process.exit(0);
}

const { migrationSources, backendSources } = readAll();
const problems = analyse(migrationSources, backendSources);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const latest = latestReturnClause(migrationSources);
console.log(
  `${LABEL} OK — ${FN} RETURNS ${latest.returns} (${latest.file}); ` +
    `${findCallers(backendSources).length} caller(s) all select ${REQUIRED_COLUMNS.join(" + ")}`
);
