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
 *   RULE 3 (static, RULING 443.64 #2, CC-3) — every scalar subquery in the newest definition of
 *            accounting.posting_source_load_id is single-row by construction: it looks its row up by a primary key
 *            (`<alias>.id = p_…`) or it aggregates / LIMITs. 202615520300 added a Relay fallback keyed on
 *            fuel.fuel_transactions.relay_fuel_transaction_id, which is not unique (one Relay fill = 2 fuel rows, 73 on
 *            prod); the subquery raised "more than one row returned by a subquery" and this guard crashed on every live
 *            run instead of reporting. Fixed in 202615580900; this rule keeps a non-unique lookup from coming back.
 *   A live query that errors is a FAIL with the database's message, never a stack trace that guards nothing.
 *   A multi-load settlement's per-load pay-run leg is expected to carry a load its own settlement lines name (443.64).
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
    // A comment that MENTIONS the insert is not one (the r391 writer's header prose tripped RULE 1).
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, m.index))) continue;
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

const RESOLVER_RE = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.posting_source_load_id\s*\(/i;

/** Each `(SELECT …)` in `body`, up to its matching close paren. */
export function scalarSubqueries(body) {
  const out = [];
  for (const m of body.matchAll(/\(\s*SELECT\b/gi)) {
    let depth = 0;
    for (let i = m.index; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")" && --depth === 0) { out.push(body.slice(m.index, i + 1)); break; }
    }
  }
  return out;
}

/** RULE 3: a resolver lookup that can match several rows (keyed on a non-id column, no aggregate, no LIMIT). */
export function resolverFailures(rel, sql) {
  const failures = [];
  const start = sql.search(RESOLVER_RE);
  const tag = start === -1 ? null : /\$(\w*)\$/.exec(sql.slice(start));
  const open = tag ? start + tag.index + tag[0].length : -1;
  const close = tag ? sql.indexOf(tag[0], open) : -1;
  if (open === -1 || close === -1) return [`RULE 3 ${rel}: no dollar-quoted body for accounting.posting_source_load_id`];
  for (const sub of scalarSubqueries(sql.slice(open, close))) {
    const where = sub.slice(sub.search(/\bWHERE\b/i));
    const keys = [...where.matchAll(/\b(\w+)\.(\w+)(?:::\w+)?\s*=\s*(?:[\w.]+\(\s*)?p_\w+/g)].map((k) => k[2]);
    const singleRow = /\b(count|array_agg|min|max|bool_and|bool_or|sum)\s*\(|\bLIMIT\s+1\b/i.test(sub);
    const nonUnique = keys.filter((k) => k !== "id");
    if (keys.length === 0) failures.push(`RULE 3 ${rel}: resolver lookup has no p_ key — cannot prove it single-row: ${sub.replace(/\s+/g, " ").slice(0, 120)}`);
    else if (nonUnique.length && !keys.includes("id") && !singleRow) {
      failures.push(`RULE 3 ${rel}: resolver lookup keyed on non-unique ${nonUnique.join(", ")} returns several rows (SQLSTATE 21000) — aggregate or key it on id: ${sub.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return failures;
}

export function newestResolverMigration() {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(dir, files[i]), "utf8");
    if (RESOLVER_RE.test(sql)) return { rel: `db/migrations/${files[i]}`, sql };
  }
  return null;
}

export function run() {
  const files = walk(join(ROOT, "apps/backend/src")).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));
  const { failures, inserts } = staticFailures(files);
  if (inserts === 0) failures.push("RULE 1: found 0 posting INSERTs under apps/backend/src — the matcher is stale");
  const resolver = newestResolverMigration();
  if (!resolver) failures.push("RULE 3: no migration defines accounting.posting_source_load_id — the matcher is stale");
  else failures.push(...resolverFailures(resolver.rel, resolver.sql));
  return { failures, inserts, resolver: resolver?.rel };
}

export function liveFailures({ mismatched }) {
  return mismatched.map((r) => `RULE 2 posting ${r.id} (${r.source_transaction_type} ${r.source_transaction_id}) stamp=${r.load_id ?? "NULL"} source says ${r.expected ?? "NULL"}`);
}

export function liveErrorFailures(err) {
  return [`RULE 2 the live check could not run — ${err?.code ? `SQLSTATE ${err.code} ` : ""}${err?.where ? `(${err.where}) ` : ""}${err?.message ?? err}`];
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const applied = (await client.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION])).rows[0];
  if (!applied) { await client.query("ROLLBACK"); return null; }
  const rows = (await client.query(`
    WITH p AS (
      -- ROUND 393.2 (CC-2): a leg of a reclass-BY-LOAD entry is expected to carry the load the reclassify engine recorded
      -- for it in accounting.reclassify_batch_lines (from_load_id on the leg that takes the line off its old load,
      -- to_load_id on the leg that puts it on the new one; the undo entry the other way round). Every other posting is
      -- expected to carry what its source resolves to. Same strictness, read from the engine's own record.
      SELECT jep.id, jep.source_transaction_type, jep.source_transaction_id, jep.load_id, jep.created_at,
             COALESCE(rc.expected_load, accounting.posting_source_load_id(jep.source_transaction_type, jep.source_transaction_id, jep.source_transaction_line_id, jep.reversal_of_line_id), sx.line_load) AS expected
        FROM accounting.journal_entry_postings jep
        -- RULING 443.64 #2 (CC-3): the resolver names a settlement's load only when the settlement covers ONE load. The
        -- pay-run close engine posts a multi-load settlement's pay / recovery legs per load (settlement-payrun-close
        -- byRoleLoad / perLoad), each leg carrying the load of its own settlement line. Such a leg is expected to carry a
        -- load that settlement's own lines name — read from the engine's record, never "any load". Measured on prod
        -- 2026-10-11: 263 of 263 such legs name a load on their settlement's lines (64 settlements), 0 name another load.
        LEFT JOIN LATERAL (
          SELECT jep.load_id AS line_load
           WHERE jep.source_transaction_type IN ('driver_settlement', 'settlement') AND jep.load_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
                          WHERE sl.settlement_id::text = jep.source_transaction_id AND sl.load_id = jep.load_id)
        ) sx ON true
        LEFT JOIN LATERAL (
          SELECT CASE
                   WHEN bl.reclass_journal_entry_id = jep.journal_entry_uuid
                     THEN CASE WHEN jep.debit_or_credit = bl.debit_or_credit THEN bl.to_load_id ELSE bl.from_load_id END
                   ELSE CASE WHEN jep.debit_or_credit = bl.debit_or_credit THEN bl.from_load_id ELSE bl.to_load_id END
                 END AS expected_load
            FROM accounting.reclassify_batch_lines bl
           WHERE bl.to_load_id IS NOT NULL
             AND (bl.reclass_journal_entry_id = jep.journal_entry_uuid OR bl.undo_journal_entry_id = jep.journal_entry_uuid)
             AND bl.source_transaction_id = jep.source_transaction_id
             AND bl.amount_cents = jep.amount_cents
           LIMIT 1
        ) rc ON true)
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
    const fn = (sub) => `CREATE OR REPLACE FUNCTION accounting.posting_source_load_id(p_source_type text, p_source_id text)\n AS $function$\n SELECT CASE WHEN p_source_type = 'fuel_event' THEN ${sub} END\n$function$;`;
    const r3 = (sql) => resolverFailures("planted.sql", sql);
    const relayOld = fn("COALESCE((SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id), (SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id))");
    const relayNew = fn("COALESCE((SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.id::text = p_source_id), (SELECT CASE WHEN count(DISTINCT d.load_id) = 1 AND count(d.load_id) = count(*) THEN (array_agg(d.load_id))[1] END FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id))");
    const cases = [
      ["resolver-stamped insert passes", f(ok).length === 0],
      ["stated NULL-by-design insert passes", f(nul).length === 0],
      ["insert without load_id fails", f(missing).some((x) => x.startsWith("RULE 1"))],
      ["unexplained NULL fails", f(silentNull).some((x) => x.startsWith("RULE 1"))],
      ["a comment that mentions the INSERT is not an insert", f("// Nine services INSERT INTO accounting.journal_entry_postings directly.\n *   INSERT INTO accounting.journal_entry_postings x\n" + ok).length === 0],
      ["a real insert after a comment is still checked", f("// note\n" + missing).some((x) => x.startsWith("RULE 1"))],
      ["live clean passes", liveFailures({ mismatched: [] }).length === 0],
      // RULE 3 plants the multi-row case: 202615520300's Relay fallback, keyed on the non-unique relay id.
      ["resolver lookup on a non-unique key fails (the 443.64 crash)", r3(relayOld).some((x) => x.startsWith("RULE 3") && x.includes("relay_fuel_transaction_id"))],
      ["resolver lookup on a non-unique key that aggregates passes", r3(relayNew).length === 0],
      ["resolver lookup on a non-unique key with LIMIT 1 passes", r3(fn("(SELECT d.load_id FROM fuel.fuel_transactions d WHERE d.relay_fuel_transaction_id::text = p_source_id LIMIT 1)")).length === 0],
      ["resolver primary-key lookups pass", r3(fn("(SELECT d.load_id FROM accounting.expenses d WHERE d.id::text = p_source_id)")).length === 0],
      ["resolver join keyed on the parent id passes", r3(fn("(SELECT b.load_id FROM accounting.bill_payments d JOIN accounting.bills b ON b.id = d.bill_id WHERE d.id::text = p_source_id)")).length === 0],
      ["202615520300 on disk (the shipped crash) fails RULE 3", (() => { const rel = "db/migrations/202615520300_posting_source_load_id_relay_fill_path.sql"; return resolverFailures(rel, readFileSync(join(ROOT, rel), "utf8")).some((x) => x.includes("relay_fuel_transaction_id")); })()],
      ["the newest resolver migration on disk passes RULE 3", (() => { const m = newestResolverMigration(); return !!m && resolverFailures(m.rel, m.sql).length === 0; })()],
      ["a live query error is a FAIL line, not a crash", liveErrorFailures(new Error("more than one row returned by a subquery used as an expression")).some((x) => x.startsWith("RULE 2") && x.includes("more than one row"))],
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
    let m = null;
    let lf = [];
    try {
      m = await measure(client);
      lf = m ? liveFailures({ mismatched: m.mismatched }) : [];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf = liveErrorFailures(err);
    }
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
