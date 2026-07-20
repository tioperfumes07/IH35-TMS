#!/usr/bin/env node
// verify-qbo-remote-counts-entity-scope (D-#1 RECON-COLLECTOR)
//
// accounting.qbo_remote_counts is per-entity data: one row per (operating_company_id, entity_type,
// collection_run_id). Every read runs under withLuciaBypass (app.bypass_rls='lucia'), which DISABLES the
// RLS policy that would otherwise scope the query — so entity scoping in a bypassed read is the
// application's job, and an unscoped read silently spans TRANSP + TRK + USMCA.
//
// Why this is a correctness defect and not a style nit:
//   A freshness/staleness check written as `SELECT max(collected_at) FROM accounting.qbo_remote_counts`
//   returns the MAX across ALL entities. One healthy company's feed therefore MASKS another company's
//   dead feed — the reconciliation control reports fresh while an entity's books are being compared
//   against nothing. The books of TRANSP, TRK and USMCA are never consolidated (owner lock); a metric
//   that silently unions them is wrong by construction, and it gets worse at USMCA launch.
//
// Invariant: every SQL statement touching accounting.qbo_remote_counts carries an
// operating_company_id predicate (reads) or column (writes). No allowlist — a violation is fixed,
// never excused.
//
// Self-test: --selftest (proves the guard FAILS on an unscoped read).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const TABLE = "accounting.qbo_remote_counts";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Extract every backtick-delimited template literal that mentions the table.
 * All production SQL in this codebase is written as a template literal.
 */
/**
 * Strip line + block comments. A guard must assert on CODE, never on prose: comments legitimately
 * quote old/bad SQL when documenting a fix, and matching that text produces false failures.
 * Newlines are preserved so reported line numbers stay accurate.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)));
}

function sqlBlocksMentioningTable(source) {
  const blocks = [];
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf("`", i);
    if (start === -1) break;
    let end = start + 1;
    while (end < source.length) {
      if (source[end] === "\\") { end += 2; continue; }
      if (source[end] === "`") break;
      end += 1;
    }
    if (end >= source.length) break;
    const block = source.slice(start + 1, end);
    if (block.includes(TABLE)) blocks.push({ block, start });
    i = end + 1;
  }
  return blocks;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

/**
 * @param {{rel: string, source: string}[]} [override] injected sources (self-test only)
 * @returns {string[]} failures
 */
export function run(override) {
  const failures = [];
  const files = override ?? walk(SRC).map((p) => ({ rel: path.relative(ROOT, p), source: fs.readFileSync(p, "utf8") }));

  for (const { rel, source } of files) {
    if (!source.includes(TABLE)) continue;
    for (const { block, start } of sqlBlocksMentioningTable(stripComments(source))) {
      if (block.includes("operating_company_id")) continue;
      failures.push(
        `${rel}:${lineOf(source, start)} — SQL touching ${TABLE} has no operating_company_id predicate; ` +
          `under withLuciaBypass this reads ACROSS entities (TRANSP/TRK/USMCA) and one entity's fresh feed masks another's dead feed`
      );
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
function selftest() {
  const scoped = {
    rel: "fake/scoped.ts",
    source: "const r = await c.query(`SELECT max(collected_at) FROM accounting.qbo_remote_counts WHERE operating_company_id = $1`, [id]);",
  };
  const unscoped = {
    rel: "fake/unscoped.ts",
    source: "const r = await c.query(`SELECT max(collected_at) FROM accounting.qbo_remote_counts`);",
  };
  const insert = {
    rel: "fake/insert.ts",
    source: "await c.query(`INSERT INTO accounting.qbo_remote_counts (operating_company_id, entity_type) VALUES ($1,$2)`);",
  };
  const unrelated = { rel: "fake/other.ts", source: "const x = `SELECT 1 FROM mdata.loads`;" };
  // Regression: documenting a fix by quoting the OLD unscoped SQL in a comment must NOT fail the guard.
  const commentQuotingOldSql = {
    rel: "fake/commented.ts",
    source:
      "// The prior form was `SELECT max(collected_at) FROM accounting.qbo_remote_counts` with no predicate.\n" +
      "const r = await c.query(`SELECT max(collected_at) FROM accounting.qbo_remote_counts WHERE operating_company_id = $1`, [id]);",
  };
  const blockCommentQuotingOldSql = {
    rel: "fake/blockcommented.ts",
    source: "/* legacy: `SELECT 1 FROM accounting.qbo_remote_counts` */\nconst y = 1;",
  };

  const cases = [
    ["scoped read passes", [scoped], 0],
    ["unscoped read fails", [unscoped], 1],
    ["scoped insert passes", [insert], 0],
    ["unrelated SQL ignored", [unrelated], 0],
    ["mixed: only the unscoped one is reported", [scoped, unscoped, insert], 1],
    ["comment quoting old unscoped SQL is ignored", [commentQuotingOldSql], 0],
    ["block comment quoting old SQL is ignored", [blockCommentQuotingOldSql], 0],
  ];

  let bad = 0;
  for (const [name, files, expected] of cases) {
    const got = run(files);
    if (got.length !== expected) {
      bad += 1;
      console.error(`  ✗ selftest "${name}": expected ${expected} failure(s), got ${got.length}`);
      for (const f of got) console.error(`      ${f}`);
    } else {
      console.log(`  ✓ selftest "${name}"`);
    }
  }
  if (bad > 0) {
    console.error("verify:qbo-remote-counts-entity-scope SELFTEST FAILED");
    process.exit(1);
  }
  console.log("verify:qbo-remote-counts-entity-scope SELFTEST PASS");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = run();
    if (failures.length) {
      console.error(`verify:qbo-remote-counts-entity-scope FAIL — ${failures.length} cross-entity read(s) of ${TABLE}:`);
      for (const f of failures) console.error("  ✗ " + f);
      process.exit(1);
    }
    console.log(`verify:qbo-remote-counts-entity-scope PASS (every ${TABLE} statement is entity-scoped)`);
  }
}
