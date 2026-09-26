#!/usr/bin/env node
// Purge-window STATE (Lead ROUND 99.4 / 100.4 / 101.4). Required value: 0 violations — a count,
// never a line number or an offset.
//
// The mass void leaves rows in place (#22384; Law 7: nothing is deleted), so the window is read by the
// STATE of its rows, never by their absence:
//   STATIC  1. exactly the ten named arms may skip EMPTY BY PURGE, and each still calls the helper
//              (the tenth, verify-settled-load-carries-settled-status, was ruled in with #22467 on 2026-09-23);
//           2. the three arms that once counted every row count by the generated live_predicate;
//           3. every generated entry states live_predicate (null stated, never missing);
//           4. purge_state.json: verified_at is null before a PASS, or carries the verifier's own PASS shape.
//   LIVE    5. no voided row without a void_reason, on every generated table that has both columns;
//           6. no journal entry whose reversal link points at an entry that does not exist;
//           7. no journal posting whose reversed_by_line_id points at a posting that does not exist.
// Tables come from scripts/purge/usmca-purge-expected-zero.generated.json; columns from the live catalog.
// is_sample_data = false is stated explicitly wherever the column exists. Read-only (BEGIN READ ONLY,
// always ROLLBACK). No DATABASE_URL, or an unreachable database, is a FAIL, never a pass.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_ZERO_PATH, PURGE_STATE_PATH, PURGE_WINDOW_GUARDS } from "./lib/purge-window.mjs";
export const REQUIRES_LIVE_DB =
  "live-data guard; the purge-window state is read from live rows and fails closed with no DATABASE_URL (ROUND 99.4)";

const LABEL = "verify-purge-window-state";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_ARMS = [
  ["verify-alwaystrack-parity", "mdata.loads"],
  ["verify-no-empty-zero-settlement", "driver_finance.driver_settlements"],
  ["verify-control-totals", "driver_finance.driver_settlements"],
];

export function staticViolations({ readScript, spec, state }) {
  const v = [];
  if (PURGE_WINDOW_GUARDS.length !== 10) v.push(`the exemption lists ${PURGE_WINDOW_GUARDS.length} arms; exactly 10 are ruled`);
  for (const arm of PURGE_WINDOW_GUARDS) {
    const src = readScript(arm);
    if (src == null) v.push(`${arm}: file missing`);
    else if (!/exitIfEmptyByPurge\s*\(|purgeWindowFor\s*\(/.test(src)) v.push(`${arm}: no longer calls the purge-window helper`);
  }
  for (const [arm, table] of LIVE_ARMS) {
    const src = readScript(arm) ?? "";
    if (!src.includes(`purgeLiveRowCondition(LABEL, "${table}")`) && !src.includes(`purgeLiveRowCondition(LABEL, '${table}')`)) {
      v.push(`${arm}: does not count ${table} by the generated live_predicate`);
    }
  }
  const entries = spec.must_be_zero_after_purge ?? [];
  for (const e of entries) {
    if (!Object.prototype.hasOwnProperty.call(e, "live_predicate")) v.push(`${e.table}: generated entry does not state live_predicate`);
  }
  if (state && state.verified_at != null) {
    if (state.verified_by !== "scripts/purge/verify-purge.mjs") v.push(`purge_state.json: verified_at is set but not by scripts/purge/verify-purge.mjs`);
    if (state.tables_verified !== entries.length) v.push(`purge_state.json: tables_verified ${state.tables_verified} != ${entries.length} generated tables`);
  }
  return v;
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}
const readScript = (name) => {
  const p = path.join(ROOT, "scripts", `${name}.mjs`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

async function liveViolations(client, spec) {
  const v = [];
  const counted = [];
  const entries = (spec.must_be_zero_after_purge ?? []).filter((e) => e.live_predicate);
  const cols = await client.query(
    `SELECT table_schema || '.' || table_name AS t, array_agg(column_name::text) AS cols
       FROM information_schema.columns
      WHERE (table_schema || '.' || table_name) = ANY($1::text[])
      GROUP BY 1`,
    [entries.map((e) => e.table)]
  );
  const colsOf = new Map(cols.rows.map((r) => [r.t, new Set(r.cols)]));
  for (const e of entries) {
    const c = colsOf.get(e.table);
    if (!c) {
      v.push(`${e.table}: in the generated file but not in the live database`);
      continue;
    }
    if (!(c.has("voided_at") && c.has("void_reason"))) continue;
    const sample = c.has("is_sample_data") ? " AND is_sample_data = false" : "";
    const r = await client.query(
      `SELECT count(*) FILTER (WHERE voided_at IS NOT NULL)::int AS voided,
              count(*) FILTER (WHERE voided_at IS NOT NULL AND (void_reason IS NULL OR btrim(void_reason) = ''))::int AS no_reason
         FROM ${e.table} WHERE (${e.where})${sample}`
    );
    counted.push(`${e.table} ${r.rows[0].voided} voided`);
    if (r.rows[0].no_reason > 0) v.push(`${e.table}: ${r.rows[0].no_reason} voided row(s) with no void_reason`);
  }
  const je = (spec.must_be_zero_after_purge ?? []).find((e) => e.table === "accounting.journal_entries");
  if (je) {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM accounting.journal_entries je
        WHERE (${je.where.replace(/\boperating_company_id\b/g, "je.operating_company_id")}) AND je.is_sample_data = false
          AND ((je.reversed_by_je_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.id = je.reversed_by_je_id))
            OR (je.reverses_je_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.id = je.reverses_je_id)))`
    );
    if (r.rows[0].n > 0) v.push(`accounting.journal_entries: ${r.rows[0].n} reversal link(s) to an entry that does not exist`);
  }
  const jep = (spec.must_be_zero_after_purge ?? []).find((e) => e.table === "accounting.journal_entry_postings");
  if (jep) {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
        WHERE (${jep.where.replace(/\bjournal_entry_id\b/g, "p.journal_entry_id")})
          AND p.reversed_by_line_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings r WHERE r.id = p.reversed_by_line_id)`
    );
    if (r.rows[0].n > 0) v.push(`accounting.journal_entry_postings: ${r.rows[0].n} reversed_by_line_id link(s) to a posting that does not exist`);
  }
  return { violations: v, counted };
}

if (process.argv.includes("--selftest")) {
  const spec = readJson(EXPECTED_ZERO_PATH);
  const good = staticViolations({ readScript, spec, state: readJson(PURGE_STATE_PATH) });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL: the real tree has static violations:\n  - ${good.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["an all-row arm stops using the generated predicate", { readScript: (n) => (n === "verify-control-totals" ? (readScript(n) ?? "").replace(/purgeLiveRowCondition\(LABEL, 'driver_finance\.driver_settlements'\)/, "'true'") : readScript(n)), spec, state: null }],
    ["a generated entry drops live_predicate", { readScript, spec: { ...spec, must_be_zero_after_purge: spec.must_be_zero_after_purge.map((e, i) => (i === 0 ? { table: e.table, where: e.where } : e)) }, state: null }],
    ["verified_at set by hand", { readScript, spec, state: { verified_at: "2026-09-23T12:00:00Z" } }],
    ["an arm stops calling the helper", { readScript: (n) => (n === "verify-fuel-transactions-per-load" ? "// nothing" : readScript(n)), spec, state: null }],
  ];
  for (const [what, input] of plants) {
    if (staticViolations(input).length === 0) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${plants.length} planted static regressions each caught; real tree clean`);
  process.exit(0);
}

const spec = readJson(EXPECTED_ZERO_PATH);
if (!spec) {
  console.error(`${LABEL}: FAIL — ${path.relative(ROOT, EXPECTED_ZERO_PATH)} is missing; the window has no liveness rule.`);
  process.exit(1);
}
const violations = staticViolations({ readScript, spec, state: readJson(PURGE_STATE_PATH) });

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set. The window state is read from live rows; a guard that cannot read them is a FAIL, never a pass (ROUND 29.9-B). Static violations: ${violations.length}.`);
  process.exit(1);
}
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (e) {
  console.error(`${LABEL}: FAIL — database unreachable (${String(e.message).split("\n")[0]}).`);
  process.exit(1);
}
let live;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  live = await liveViolations(client, spec);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
violations.push(...live.violations);

if (violations.length > 0) {
  console.error(`${LABEL}: FAIL — purge-window state violations: ${violations.length} (required 0)`);
  for (const x of violations) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — purge-window state violations: 0 (required 0). Static: 10 arms, 3 on the generated live_predicate, every entry states live_predicate, purge_state.json consistent. Live: ${live.counted.join(", ")}; every voided row carries a reason; no dangling reversal link.`);
