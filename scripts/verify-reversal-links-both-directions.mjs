#!/usr/bin/env node
// AUTH-400 rehearsal (CC-1, 2026-10-04) — a reversal link is written in BOTH directions, and a line is reversed ONCE.
//
// Measured: reclassify's out-leg named expense line 8314452b (reversal_of_line_id) without stamping the original's
// reversed_by_line_id (prod: exactly that 1 one-sided link). The line read as live; the expense void — the posting
// engine, which reversed every line of the original batch with no liveness check and overwrote the back-link —
// reversed it a SECOND time, and never reversed the reclass in-leg that now carried the money.
//
// static:
//   1. posting-line-writer.ts stamps the original's reversed_by_line_id after writing any reversal line, only when it is
//      unreversed, and refuses (PostingLineAlreadyReversedError) when another line already reversed it;
//   2. posting-engine.service.ts reverses only LIVE lines naming the document (not the bare batch), refuses an unbalanced
//      set (REVERSAL_NOT_BALANCED), and never overwrites a back-link (POSTING_LINE_ALREADY_REVERSED);
//   3. migration 202615410300 creates the unique index uq_jep_one_reversal_per_line.
// --selftest plants each regression. --live (read-only, FAIL-CLOSED): 0 one-sided links, 0 lines with 2+ reversals,
// the index exists.
import { readFileSync } from "node:fs";

const LABEL = "verify-reversal-links-both-directions";
const WRITER = "apps/backend/src/accounting/posting-line-writer.ts";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const MIG = "db/migrations/202615410300_one_reversal_per_posting_line.sql";
const JES = "apps/backend/src/accounting/journal-entries.service.ts";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

export function problems(writer, engine, mig, jes = read(JES)) {
  const p = [];
  if (!/if \(l\.o_id && l\.o_reversed_by !== l\.id\) \{/.test(jes) || !/restore_original_not_cancelled_by_this_entry/.test(jes)) p.push("restore must refuse an original this entry did not cancel (it would duplicate a live line)");
  if (!/SET reversed_by_line_id = \$2::uuid, updated_at = now\(\)\s*\n\s*WHERE id = \$1::uuid AND \(reversed_by_line_id IS NULL OR reversed_by_line_id = \$2::uuid\)/.test(writer)) p.push("writer must stamp the original's reversed_by_line_id, only when unreversed");
  if (!/if \(!back\.rows\[0\]\) throw new PostingLineAlreadyReversedError\(line\.reversal_of_line_id\)/.test(writer)) p.push("writer must refuse an original already reversed by another line");
  if (!/AND reversed_by_line_id IS NULL\s*\n\s*AND reversal_of_line_id IS NULL\s*\n\s*AND \(posting_batch_id = \$2::uuid OR \(source_transaction_type = \$3 AND source_transaction_id = \$4\)\)/.test(engine)) p.push("posting-engine reversal must select only LIVE lines naming the document");
  if (!/"REVERSAL_NOT_BALANCED"/.test(engine.slice(engine.indexOf("async function executeSourceReversalOnClient(")))) p.push("posting-engine reversal must refuse an unbalanced live set");
  if (!/WHERE id = \$1::uuid AND operating_company_id = \$3::uuid AND reversed_by_line_id IS NULL/.test(engine) || !/"POSTING_LINE_ALREADY_REVERSED"/.test(engine)) p.push("posting-engine must never overwrite a reversal back-link");
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS uq_jep_one_reversal_per_line\s*\n\s*ON accounting\.journal_entry_postings \(reversal_of_line_id\)\s*\n\s*WHERE reversal_of_line_id IS NOT NULL;/.test(mig)) p.push("migration must create uq_jep_one_reversal_per_line");
  return p;
}

const w = read(WRITER), e = read(ENGINE), m = read(MIG);
const own = problems(w, e, m);
const plants = [
  ["writer stamps nothing", w.replace("SET reversed_by_line_id = $2::uuid, updated_at = now()", "SET updated_at = now()"), e, m],
  ["writer overwrites", w.replace("AND (reversed_by_line_id IS NULL OR reversed_by_line_id = $2::uuid)", ""), e, m],
  ["engine reverses the whole batch", w, e.replace(/AND reversed_by_line_id IS NULL\s*\n\s*AND reversal_of_line_id IS NULL\s*\n\s*AND \(posting_batch_id = \$2::uuid OR \(source_transaction_type = \$3 AND source_transaction_id = \$4\)\)/, "AND posting_batch_id = $2::uuid"), m],
  ["engine overwrites the back-link", w, e.replace("AND operating_company_id = $3::uuid AND reversed_by_line_id IS NULL", "AND operating_company_id = $3::uuid"), m],
  ["no index", w, e, m.replace("CREATE UNIQUE INDEX", "CREATE INDEX")],
  ["restore duplicates a live original", w, e, m, read(JES).replace("if (l.o_id && l.o_reversed_by !== l.id) {", "if (false) {")],
];
const missed = plants.filter(([, a, b, c, d]) => problems(a, b, c, d).length === 0).map(([n]) => n);
if (own.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...own, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: static PASS (${plants.length}/${plants.length} plants caught)`);
if (process.argv.includes("--selftest")) process.exit(0);

if (process.argv.includes("--live")) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = (await client.query(
      `SELECT
         (SELECT count(*)::int FROM accounting.journal_entry_postings x JOIN accounting.journal_entry_postings o ON o.id = x.reversal_of_line_id
           WHERE o.reversed_by_line_id IS DISTINCT FROM x.id) AS one_sided,
         (SELECT count(*)::int FROM (SELECT reversal_of_line_id FROM accounting.journal_entry_postings WHERE reversal_of_line_id IS NOT NULL
           GROUP BY 1 HAVING count(*) > 1) z) AS double_reversed,
         to_regclass('accounting.uq_jep_one_reversal_per_line') IS NOT NULL AS has_index`)).rows[0];
    await client.query("ROLLBACK");
    const bad = [];
    if (r.one_sided) bad.push(`${r.one_sided} reversal line(s) whose original does not name them back`);
    if (r.double_reversed) bad.push(`${r.double_reversed} line(s) reversed more than once`);
    if (!r.has_index) bad.push("unique index uq_jep_one_reversal_per_line missing");
    if (bad.length) {
      console.error(`${LABEL}: LIVE FAIL — ${bad.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — every reversal link is two-way, no line reversed twice, index present`);
  } finally {
    client.release();
    await pool.end();
  }
}
