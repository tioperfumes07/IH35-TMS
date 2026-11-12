#!/usr/bin/env node
/**
 * GAP-PREMERGE-GATES-EXPAND Gate 1: Static RLS migration scanner.
 *
 * Scans NEW SQL files in db/migrations/ (above the baseline) for CREATE TABLE
 * statements that include an `operating_company_id` column.  For each such
 * table, verifies that ENABLE ROW LEVEL SECURITY appears in the NEW migration
 * file itself OR in any migration above the baseline.
 *
 * Why baseline?  Migrations below BASELINE_MIGRATION_NUM were authored before
 * this gate existed and represent grandfathered technical debt.  The gate
 * exists to prevent NEW tables from entering the codebase without RLS.
 *
 * This catches the GAP-81 failure class: a PR adds a carrier-scoped table
 * (with operating_company_id) but forgets to enable RLS before merging.
 *
 * How it works:
 *   Pass 1 — scan migrations above the baseline; collect tables with OCI.
 *   Pass 2 — scan ALL migrations; collect every table with ENABLE RLS.
 *   Report — tables from Pass-1 absent from Pass-2.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

/**
 * Only migrations with a sequence number strictly greater than this value are
 * checked for the OCI-without-RLS pattern.  Migrations at or below this
 * baseline are grandfathered (authored before this gate was introduced).
 */
const BASELINE_MIGRATION_NUM = 406;

function fail(msg) {
  console.error(`verify:rls-migration-scan FAIL: ${msg}`);
  process.exit(1);
}

/** Strip single-line SQL comments (-- ...) from a SQL string. */
function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/** Extract the numeric prefix from a migration filename like "0123_foo.sql" → 123. */
function migrationNum(filename) {
  const m = filename.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Return the set of table names (schemaless-normalised) that have
 * `operating_company_id` in their CREATE TABLE column list.
 */
function tablesWithOci(sql) {
  const clean = stripLineComments(sql);
  const results = new Set();
  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_.]+)\s*\(/gi;
  let match;
  while ((match = createRe.exec(clean)) !== null) {
    const tableName = match[1].replace(/"/g, "");
    // Capture the column list between the outer parens
    let depth = 0;
    let i = match.index + match[0].length - 1;
    const blockStart = i;
    while (i < clean.length) {
      if (clean[i] === "(") depth++;
      else if (clean[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    const block = clean.slice(blockStart, i + 1);
    if (/\boperating_company_id\b/i.test(block)) {
      results.add(tableName.toLowerCase());
    }
  }
  return results;
}

/**
 * Return the set of table names that appear in
 * ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
 */
function tablesWithRls(sql) {
  const clean = stripLineComments(sql);
  const enabled = new Set();
  const rlsRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_.]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const add = (full) => {
    enabled.add(full);
    // Also add the bare table name so bare-vs-schema-qualified mismatches pass
    const bare = full.split(".").pop();
    if (bare) enabled.add(bare);
  };
  let m;
  while ((m = rlsRe.exec(clean)) !== null) {
    add(m[1].replace(/"/g, "").toLowerCase());
  }
  // A DO-block loop also enables RLS — the 0065 pattern several migrations use:
  //   FOREACH t IN ARRAY ARRAY['a','b'] LOOP
  //     EXECUTE format('ALTER TABLE dispatch.%I ENABLE ROW LEVEL SECURITY', t); …
  //   END LOOP;
  // Every name in the loop's array is enabled on the schema the format string names. Only a literal
  // ENABLE statement inside the SAME loop body counts, so a loop that only grants does not pass.
  const loopRe = /FOREACH\s+(\w+)\s+IN\s+ARRAY\s+ARRAY\s*\[([^\]]*)\]\s*LOOP([\s\S]*?)END\s+LOOP/gi;
  while ((m = loopRe.exec(clean)) !== null) {
    const names = [...m[2].matchAll(/'([a-zA-Z0-9_]+)'/g)].map((x) => x[1].toLowerCase());
    const fmtRe = /format\(\s*'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_]+)\.%I\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY'\s*,\s*(\w+)\s*\)/gi;
    let f;
    while ((f = fmtRe.exec(m[3])) !== null) {
      if (f[2].toLowerCase() !== m[1].toLowerCase()) continue;
      for (const n of names) add(`${f[1].toLowerCase()}.${n}`);
    }
  }
  return enabled;
}

function selftest() {
  const cases = [
    ["plain statement", "ALTER TABLE x.a ENABLE ROW LEVEL SECURITY;", ["x.a"], []],
    ["FOREACH loop (capacity engine shape)",
      "DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['capacity_settings','load_board_postings']\n LOOP\n" +
      "EXECUTE format('ALTER TABLE dispatch.%I ENABLE ROW LEVEL SECURITY', t);\nEND LOOP; END $$;",
      ["dispatch.capacity_settings", "dispatch.load_board_postings"], []],
    ["loop that only grants does NOT count",
      "DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['a1'] LOOP EXECUTE format('GRANT SELECT ON s.%I TO ih35_app', t); END LOOP; END $$;",
      [], ["s.a1"]],
    ["ENABLE on a different loop variable does NOT count",
      "DO $$ DECLARE t text; u text; BEGIN FOREACH t IN ARRAY ARRAY['b1'] LOOP EXECUTE format('ALTER TABLE s.%I ENABLE ROW LEVEL SECURITY', u); END LOOP; END $$;",
      [], ["s.b1"]],
    ["commented-out loop does NOT count",
      "-- FOREACH t IN ARRAY ARRAY['c1'] LOOP EXECUTE format('ALTER TABLE s.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;",
      [], ["s.c1"]],
  ];
  let bad = 0;
  for (const [name, sql, mustHave, mustNot] of cases) {
    const got = tablesWithRls(sql);
    const ok = mustHave.every((t) => got.has(t)) && mustNot.every((t) => !got.has(t));
    if (!ok) { bad++; console.error(`  FAIL: ${name} -> ${[...got].join(",")}`); }
  }
  if (bad) { console.error(`verify:rls-migration-scan SELFTEST FAILED — ${bad} of ${cases.length}`); process.exit(1); }
  console.log(`verify:rls-migration-scan SELFTEST PASS — ${cases.length} cases`);
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fail(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newFiles = allFiles.filter(
    (f) => migrationNum(f) > BASELINE_MIGRATION_NUM
  );

  if (newFiles.length === 0) {
    console.log(
      `verify:rls-migration-scan PASS — no new migrations above baseline ${BASELINE_MIGRATION_NUM}`
    );
    return;
  }

  // Pass 1: OCI tables introduced by NEW migrations
  // Map: normName → first file that introduces it
  const ociTables = new Map();
  for (const file of newFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const tbl of tablesWithOci(sql)) {
      if (!ociTables.has(tbl)) ociTables.set(tbl, file);
    }
  }

  if (ociTables.size === 0) {
    console.log(
      `verify:rls-migration-scan PASS — ${newFiles.length} new migration(s) scanned, no new carrier-scoped tables found`
    );
    return;
  }

  // Pass 2: all tables with ENABLE ROW LEVEL SECURITY across the entire corpus
  const rlsSet = new Set();
  for (const file of allFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const tbl of tablesWithRls(sql)) {
      rlsSet.add(tbl);
    }
  }

  const violations = [];
  for (const [normName, file] of ociTables) {
    const bare = normName.split(".").pop();
    if (!rlsSet.has(normName) && (!bare || !rlsSet.has(bare))) {
      violations.push({ table: normName, file });
    }
  }

  if (violations.length > 0) {
    console.error(
      "verify:rls-migration-scan FAIL — new tables with operating_company_id have no ENABLE ROW LEVEL SECURITY in any migration:\n"
    );
    for (const { table, file } of violations) {
      console.error(`  ${table}  (introduced in: ${file})`);
    }
    console.error(
      "\nFix: in the same migration, add:\n" +
        "  ALTER TABLE <schema>.<table> ENABLE ROW LEVEL SECURITY;\n" +
        "  ALTER TABLE <schema>.<table> FORCE ROW LEVEL SECURITY;\n" +
        "  CREATE POLICY <table>_tenant_isolation ON <schema>.<table>\n" +
        "    USING (operating_company_id IN (SELECT org.user_accessible_company_ids()));"
    );
    process.exit(1);
  }

  console.log(
    `verify:rls-migration-scan PASS — ${ociTables.size} new carrier-scoped table(s) all have ENABLE ROW LEVEL SECURITY (${newFiles.length} new migration(s) scanned)`
  );
}

if (process.argv.includes("--selftest")) selftest();
else main().catch((err) => fail(String(err?.message ?? err)));
