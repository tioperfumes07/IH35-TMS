#!/usr/bin/env node
// ROUND 321 EVENT1-IDEMPOTENCY (CC-1, 2026-10-01). Prod had two posted, unreversed Event 1 (earn) JEs for load 13626
// ($3,400, JE 4c416f76 + de792d44) and load 13571 ($4,900, 715378ea + 86c07f57): revenue recognized twice. CC-2 made
// the JE and its latch row commit in one transaction (step 12071) and reversed both duplicates (d2ca6542, e941171e).
// This step pins the invariant itself, per (load, event), and the re-recognition half CC-1 fixed: an ACTIVE latch
// row whose JE was reversed / voided held the unique slot, so every re-fire answered already_posted forever.
//
// static: the poster retires stale (non-standing) active latch rows and inserts the new one, both inside the JE's
//         afterInsertBeforeCommit, in that order, through the unique (load, event) WHERE is_active slot.
// live (read-only, FAIL-CLOSED — no DATABASE_URL is a FAIL):
//   1. at most ONE live (posted, unvoided, unreversed, not a reversal) revenue JE per (company, load, event);
//   2. every live revenue JE is the JE of an ACTIVE latch row (no orphan = no silent double recognition);
//   3. the unique partial index load_revenue_recognition_postings_active_uq exists.
//   INFO (not a failure): active latch rows whose JE was reversed — expected after an invoice void; the poster
//   retires them on the next legitimate fire.
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "../lib/require-live-db.mjs";

const LABEL = "verify-one-event1-je-per-load";
const ROOT = new URL("../../", import.meta.url);
const POSTER = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";

export function staticProblems(src) {
  const problems = [];
  const hookAt = src.indexOf("afterInsertBeforeCommit: async (client, header) =>");
  const hookEnd = src.indexOf("} catch (err) {", hookAt);
  const retireAt = src.search(/UPDATE accounting\.load_revenue_recognition_postings p\s+SET is_active = false, status = 'voided'/);
  const insertAt = src.indexOf("INSERT INTO accounting.load_revenue_recognition_postings");
  if (hookAt < 0 || hookEnd < 0) problems.push("JE afterInsertBeforeCommit hook not found");
  if (retireAt < 0) problems.push("stale-latch retire UPDATE (is_active = false, status = 'voided') missing");
  if (insertAt < 0) problems.push("latch-row INSERT missing");
  if (hookAt >= 0 && retireAt >= 0 && insertAt >= 0) {
    if (!(retireAt > hookAt && retireAt < insertAt && insertAt < hookEnd)) problems.push("retire UPDATE must run before the INSERT, both inside afterInsertBeforeCommit");
    const retireSql = src.slice(retireAt, insertAt);
    if (!/AND p\.is_active AND NOT \$\{STANDING_LATCH_JE_PREDICATE\}/.test(retireSql)) problems.push("retire must touch only active rows whose JE is not standing (STANDING_LATCH_JE_PREDICATE)");
  }
  if (!/ON CONFLICT \(operating_company_id, load_id, event\) WHERE is_active DO NOTHING\s*\n\s*RETURNING id/.test(src)) problems.push("latch INSERT must use the unique (load, event) WHERE is_active slot with RETURNING id");
  return problems;
}

function selftest(src) {
  const own = staticProblems(src);
  if (own.length) {
    console.error(`${LABEL} --selftest FAIL on the real poster — ${own.join("; ")}`);
    process.exit(1);
  }
  // Plants: the retire removed; the retire widened to standing rows; the retire placed after the insert.
  const retireRe = /UPDATE accounting\.load_revenue_recognition_postings p\s+SET is_active = false, status = 'voided'/;
  const plants = [
    ["no retire", src.replace(retireRe, "SELECT 1")],
    ["widened retire", src.replace("AND p.is_active AND NOT ${STANDING_LATCH_JE_PREDICATE}", "AND p.is_active")],
    ["retire after insert", src.replace(retireRe, "SELECT 1").replace("if (!latch.rows[0])", "/* UPDATE accounting.load_revenue_recognition_postings p SET is_active = false, status = 'voided' */ if (!latch.rows[0])")],
  ];
  for (const [name, planted] of plants) {
    if (!staticProblems(planted).length) {
      console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS (real poster clean; ${plants.length}/${plants.length} plants caught)`);
}

const src = readFileSync(new URL(POSTER, ROOT), "utf8");
selftest(src);
if (process.argv.includes("--selftest")) process.exit(0);

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const LIVE = `
    SELECT je.id, je.operating_company_id AS opco,
           substring(je.memo from '\\[([0-9a-f-]{36})\\]') AS load_id,
           CASE WHEN je.memo LIKE 'Revrec Event 1 %' THEN 'earn' WHEN je.memo LIKE 'Revrec Event 2 %' THEN 'bill' END AS event
      FROM accounting.journal_entries je
     WHERE je.memo LIKE 'Revrec Event %' AND je.status = 'posted'
       AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`;
  const dup = await client.query(
    `WITH live AS (${LIVE}) SELECT opco::text, load_id, event, count(*)::int AS n, string_agg(id::text, ',') AS jes
       FROM live GROUP BY 1, 2, 3 HAVING count(*) > 1 ORDER BY 2`
  );
  const orphan = await client.query(
    `WITH live AS (${LIVE}) SELECT l.id::text, l.load_id, l.event FROM live l
      WHERE NOT EXISTS (SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.journal_entry_id = l.id AND r.is_active)`
  );
  const counts = await client.query(
    `WITH live AS (${LIVE}) SELECT count(*)::int AS live, count(*) FILTER (WHERE load_id IS NULL OR event IS NULL)::int AS unparsed,
            (SELECT count(*)::int FROM accounting.journal_entries WHERE memo LIKE 'Revrec Event %') AS all_revrec,
            (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'accounting' AND indexname = 'load_revenue_recognition_postings_active_uq') AS uq,
            (SELECT count(*)::int FROM accounting.load_revenue_recognition_postings r JOIN accounting.journal_entries je ON je.id = r.journal_entry_id
              WHERE r.is_active AND (je.voided_at IS NOT NULL OR je.reversed_by_je_id IS NOT NULL)) AS stale_active
       FROM live`
  );
  await client.query("ROLLBACK");
  const c = counts.rows[0];
  const problems = [];
  if (dup.rows.length) problems.push(`${dup.rows.length} (load, event) with more than one live revenue JE: ${dup.rows.map((r) => `${r.load_id}/${r.event} x${r.n} [${r.jes}]`).join(" | ")}`);
  if (orphan.rows.length) problems.push(`${orphan.rows.length} live revenue JE(s) not owned by an active latch row: ${orphan.rows.map((r) => `${r.id} ${r.load_id}/${r.event}`).join(" | ")}`);
  if (c.unparsed) problems.push(`${c.unparsed} live revenue JE(s) whose memo carries no load id / event (cannot be counted per load)`);
  if (c.uq !== 1) problems.push("unique index accounting.load_revenue_recognition_postings_active_uq is missing");
  if (problems.length) {
    console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — ${c.live} live revenue JEs (of ${c.all_revrec} Revrec JEs), at most one per (load, event), every one owned by an active latch row; unique index present. INFO: ${c.stale_active} active latch row(s) on a reversed JE (retired by the poster on the next legitimate fire).`
  );
} finally {
  client.release();
  await pool.end();
}
