#!/usr/bin/env node
/**
 * verify-every-load-born-posting-carries-its-load — ROUND 363-CC1-A (LAW 363.2), CC-1.
 *
 * The load a GL line belongs to is stamped on the posting, by the poster, in the same INSERT
 * (accounting.journal_entry_postings.load_id = accounting.posting_source_load_id(...), migration 202615350500).
 *
 * STATIC (every run, no database):
 *   RULE 1 — every `INSERT INTO accounting.journal_entry_postings` in apps/backend/src names the load_id column, and
 *            its value is either the resolver `accounting.posting_source_load_id(` or a literal NULL that the same
 *            statement explains with "NULL by design" (a posting whose source has no load: recurring template,
 *            period close, reconciliation variance). A poster that does not name the column is the defect —
 *            it would leave a load-born posting unstamped.
 * LIVE (direct endpoint, unscoped, read-only):
 *   RULE 2 — every posting created since 202615350500 applied carries exactly the load its resolver names
 *            (stamp = accounting.posting_source_load_id(type, id, line, reversal_of)). Ceiling 0. This proves the
 *            writers, not the history: pre-existing rows are CC-3's provable backfill (363-CC3-A).
 *   It also prints the two counts the Lead asked for — postings whose source resolves to a load, and of those the
 *   count with load_id written — so the backfill's progress is visible every run.
 * --selftest exercises both rules against fixtures.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the load stamp is live ledger lineage — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-every-load-born-posting-carries-its-load";
const MIGRATION = "202615350500_journal_entry_postings_load_id_stamp.sql";
const INSERT_RE = /INSERT\s+INTO\s+accounting\.journal_entry_postings\b/gi;

/** The SQL statement text (template literal) that starts at each posting INSERT in `src`. */
export function postingInserts(src) {
  const out = [];
  for (const m of src.matchAll(INSERT_RE)) {
    const end = src.indexOf("`", m.index);
    out.push(src.slice(m.index, end === -1 ? undefined : end));
  }
  return out;
}

export function staticFailures(files) {
  const failures = [];
  let inserts = 0;
  for (const { rel, src } of files) {
    for (const stmt of postingInserts(src)) {
      inserts++;
      const cut = stmt.search(/\bVALUES\b|\bSELECT\b/i);
      const names = /\bload_id\b/.test(cut === -1 ? stmt : stmt.slice(0, cut));
      const resolver = /accounting\.posting_source_load_id\s*\(/.test(stmt);
      const byDesign = /NULL by design/i.test(stmt);
      if (!names) failures.push(`RULE 1 ${rel}: a posting INSERT does not write load_id`);
      else if (!resolver && !byDesign) failures.push(`RULE 1 ${rel}: load_id is written but neither by accounting.posting_source_load_id() nor as a stated "NULL by design"`);
    }
  }
  return { failures, inserts };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") && !/\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

export function run() {
  const files = walk(join(ROOT, "apps/backend/src")).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));
  const { failures, inserts } = staticFailures(files);
  if (inserts === 0) failures.push("RULE 1: found 0 posting INSERTs under apps/backend/src — the matcher is stale");
  return { failures, inserts };
}

export function liveFailures({ mismatched }) {
  return mismatched.map((r) => `RULE 2 posting ${r.id} (${r.source_transaction_type} ${r.source_transaction_id}) stamp=${r.load_id ?? "NULL"} source says ${r.expected ?? "NULL"}`);
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const applied = (await client.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION])).rows[0];
  if (!applied) { await client.query("ROLLBACK"); return null; }
  const rows = (await client.query(`
    WITH p AS (
      SELECT id, source_transaction_type, source_transaction_id, load_id, created_at,
             accounting.posting_source_load_id(source_transaction_type, source_transaction_id, source_transaction_line_id, reversal_of_line_id) AS expected
        FROM accounting.journal_entry_postings)
    SELECT
      (SELECT count(*) FROM p WHERE expected IS NOT NULL)::int                         AS load_born,
      (SELECT count(*) FROM p WHERE expected IS NOT NULL AND load_id IS NOT NULL)::int AS stamped,
      (SELECT count(*) FROM p WHERE created_at >= $1)::int                             AS since,
      (SELECT coalesce(json_agg(x), '[]') FROM (
         SELECT id, source_transaction_type, source_transaction_id, load_id, expected FROM p
          WHERE created_at >= $1 AND load_id IS DISTINCT FROM expected LIMIT 50) x)    AS mismatched`, [applied.applied_at])).rows[0];
  await client.query("ROLLBACK");
  return { ...rows, appliedAt: applied.applied_at };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const ok = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id) VALUES ($1, accounting.posting_source_load_id($8::text, $9::text))`)";
    const nul = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id)\n -- period close: NULL by design.\n VALUES ($1, NULL)`)";
    const missing = "q(`INSERT INTO accounting.journal_entry_postings (a, b) VALUES ($1, $2)`)";
    const silentNull = "q(`INSERT INTO accounting.journal_entry_postings (a, load_id) VALUES ($1, NULL)`)";
    const f = (src) => staticFailures([{ rel: "x.ts", src }]).failures;
    const cases = [
      ["resolver-stamped insert passes", f(ok).length === 0],
      ["stated NULL-by-design insert passes", f(nul).length === 0],
      ["insert without load_id fails", f(missing).some((x) => x.startsWith("RULE 1"))],
      ["unexplained NULL fails", f(silentNull).some((x) => x.startsWith("RULE 1"))],
      ["live clean passes", liveFailures({ mismatched: [] }).length === 0],
      ["live mismatch fails", liveFailures({ mismatched: [{ id: "p1", source_transaction_type: "expense", source_transaction_id: "e1", load_id: null, expected: "l1" }] }).length === 1],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const { failures: sf, inserts } = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client);
    const lf = m ? liveFailures({ mismatched: m.mismatched }) : [];
    const summary = m
      ? `load-born postings ${m.load_born}, stamped ${m.stamped} (history is CC-3's provable backfill); ${m.since} posting(s) since ${MIGRATION} applied, 0 unstamped`
      : `${MIGRATION} not applied on this database yet — static rule only`;
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${inserts} posting INSERT(s) under apps/backend/src all write load_id; ${summary}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
