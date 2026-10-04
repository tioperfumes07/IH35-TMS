#!/usr/bin/env node
/**
 * verify-no-reversal-of-a-reversal — ROUND 390.1, CC-1.
 *
 * A reversal line is TERMINAL. A posting whose reversal_of_line_id names a line that is itself a reversal re-posts the
 * original's sign and manufactures money that is not owed (2026-10-04: 60 of 60 phantom A/P lines, $2,976.63, were
 * "Void reversal: REVERSAL: …").
 *
 * STATIC (verify-step, every run):
 *   RULE 1 — posting-line-writer refuses, by name, a line whose reversal_of_line_id names a reversal
 *            (PostingLineIsAlreadyAReversalError, "posting_line_is_already_a_reversal") BEFORE its INSERT.
 *   RULE 2 — the two paths whose purpose is to bring reversed money back (reinstate, reclassify undo, check unvoid)
 *            use restoreReversedJournalEntry*, never voidJournalEntry / reverseJournalEntryNoFlip on the reversing JE.
 * LIVE (direct, read-only, --live):
 *   RULE 3 — SELECT count(*) of postings whose reversal_of_line_id points at a line that itself has
 *            reversal_of_line_id IS NOT NULL — must be 0. No baseline, no allowlist (ROUND 390.1 §4c). The existing
 *            rows are being purged; until then this reports the exact count and fails.
 * --selftest: FAILS on a planted three-deep chain, PASSES on original -> reversal.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-reversal-of-a-reversal";
const SRC = "apps/backend/src/accounting";
export const F = {
  writer: `${SRC}/posting-line-writer.ts`,
  reinstate: `${SRC}/reinstate-document.service.ts`,
  checkVoid: `${SRC}/checks/check-void.service.ts`,
  reclassify: `${SRC}/reclassify/reclassify.service.ts`,
  je: `${SRC}/journal-entries.service.ts`,
};
export const CHAIN_SQL = `SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
  JOIN accounting.journal_entry_postings t ON t.id = p.reversal_of_line_id
 WHERE t.reversal_of_line_id IS NOT NULL`;

export function staticProblems(read) {
  const out = [];
  const w = read(F.writer) ?? "";
  const check = w.indexOf("throw new PostingLineIsAlreadyAReversalError(");
  const insert = w.indexOf("INSERT INTO accounting.journal_entry_postings (", w.indexOf("async function writeLine("));
  if (!/posting_line_is_already_a_reversal/.test(w) || check < 0 || insert < 0 || check > insert) out.push("RULE 1 posting-line-writer does not refuse a reversal of a reversal before its INSERT");
  if (!/export async function restoreReversedJournalEntryInClientTx\(/.test(read(F.je) ?? "")) out.push("RULE 2 restoreReversedJournalEntryInClientTx is missing");
  const ri = read(F.reinstate) ?? "";
  const riFn = ri.slice(ri.indexOf("export async function reinstateDocumentThenVoidReversal("));
  if (!/restoreReversedJournalEntry\(/.test(riFn) || /await voidJournalEntry\(/.test(riFn)) out.push("RULE 2 reinstate still voids the void's reversing JE instead of restoring");
  const cv = read(F.checkVoid) ?? "";
  if (!/await restoreReversedJournalEntry\(/.test(cv) || /await voidJournalEntry\(/.test(cv)) out.push("RULE 2 check unvoid still voids the void's reversing JE instead of restoring");
  const rc = read(F.reclassify) ?? "";
  const undo = rc.slice(rc.indexOf("export async function undoReclassifyBatch("), rc.indexOf("export async function listReclassifyBatches("));
  if (!/restoreReversedJournalEntryInClientTx\(/.test(undo) || /reverseJournalEntryNoFlip\(/.test(undo)) out.push("RULE 2 reclassify undo still reverses the reclass JE (its out-leg is a reversal)");
  return out;
}

export function liveProblems(n) {
  return n > 0 ? [`RULE 3 ${n} posting(s) reverse a line that is itself a reversal (must be 0 — no baseline)`] : [];
}

/** Pure chain count over an in-memory posting set: { id, reversal_of_line_id }[]. */
export function countReversalsOfReversals(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.filter((p) => p.reversal_of_line_id && byId.get(p.reversal_of_line_id)?.reversal_of_line_id).length;
}

export function run() {
  return staticProblems((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const real = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null);
    const plant = (file, from, to) => (f) => (f === file ? (real(f) ?? "").replace(from, to) : real(f));
    const pair = [{ id: "o", reversal_of_line_id: null }, { id: "r", reversal_of_line_id: "o" }];
    const cases = [
      ["the shipped tree passes", staticProblems(real).length === 0],
      ["a writer without the refusal fails", staticProblems(plant(F.writer, "throw new PostingLineIsAlreadyAReversalError(", "void (")).some((x) => x.startsWith("RULE 1"))],
      ["reinstate voiding the reversing JE fails", staticProblems(plant(F.reinstate, "await restoreReversedJournalEntry(", "await voidJournalEntry(")).some((x) => x.startsWith("RULE 2"))],
      ["original -> reversal passes", liveProblems(countReversalsOfReversals(pair)).length === 0],
      ["a planted three-deep chain fails", liveProblems(countReversalsOfReversals([...pair, { id: "rr", reversal_of_line_id: "r" }])).some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  if (process.argv.includes("--live")) {
    const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
    const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      const n = (await client.query(CHAIN_SQL)).rows[0].n;
      await client.query("ROLLBACK");
      console.log(`${LABEL}: live chain query = ${n}`);
      problems.push(...liveProblems(n));
    } finally {
      client.release?.();
      await pool?.end?.();
    }
  }
  if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
  else console.log(`${LABEL}: OK — the writer refuses a reversal of a reversal; reinstate / unvoid / reclassify undo restore instead${process.argv.includes("--live") ? "; live chain = 0" : ""}.`);
}
