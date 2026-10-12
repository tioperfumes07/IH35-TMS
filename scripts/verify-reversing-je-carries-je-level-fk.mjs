#!/usr/bin/env node
/**
 * ACCT-F335 — a reversing journal entry was linked to its original at the LINE level but not at the
 * JOURNAL-ENTRY level, so the pair was discoverable only by string-parsing the memo "Reversal of <uuid>".
 *
 * WHY THAT MATTERS: no journal entry is ever voided in place (0 rows prod-wide) because reversal-by-new-JE
 * is the only mechanism WORM permits. That makes journal_entries.reverses_je_id / reversed_by_je_id THE
 * machine-readable audit link between a JE and its reversal, and a NULL makes the reversal invisible to
 * every structural query. The ACCT-F251 sweep already had to fall back to memo-matching for exactly this
 * reason, and ACCT-F333 nearly reversed an already-reversed bill payment because its JE-level FK was NULL
 * — a $88.88 double-reversal on the go-live ledger, avoided only by checking a fourth linkage path by hand.
 *
 * THE INVARIANT, STATED STRUCTURALLY ON PURPOSE: if a journal entry owns ANY posting line that carries
 * reversal_of_line_id, that entry IS a reversal, and it MUST carry reverses_je_id pointing at the entry
 * that owns the original line.
 *
 * ★ DELIBERATELY NOT A MEMO GREP. The obvious version of this guard looks for memos matching
 * "Reversal of <uuid>" with a NULL FK. The posting engine's own source says why that is wrong: "A guard
 * that greps memos is a guard that breaks the day someone rewords a memo." The line-level pointer is
 * written by the reverser itself and cannot be reworded. Both probes select the SAME 2 rows on prod today
 * (verified) — so this costs nothing in coverage and survives a memo change.
 *
 * DB-backed. Per the false-empty law it refuses to pass on a zero it cannot corroborate: it fails if it
 * finds no reversing entries at all, and it SKIPs (rather than crashing as a false money finding) when
 * handed a reachable but unmigrated database — the ACCT-F333 lesson.
 */
import pg from "pg";

const LABEL = "3053-verify-reversing-je-carries-je-level-fk";

/**
 * PRE-EXISTING ROWS THIS GUARD DOES NOT FAIL ON — named, dated, and justified individually.
 * This is a ratchet, not an amnesty: anything NEW fails immediately. Removing an entry here must
 * only ever happen by FIXING the row, never to make a red guard green.
 *
 * e36c6aef — TRANSP (91e0bf0a). Its reversal predates the LV-INVOICE-VOID-REVERSAL fix that began
 * populating the JE-level FK, exactly like USMCA's 8fd32bec which WAS repaired under ACCT-F335.
 * It is excluded for one reason only: the 2026-08-11 weekend merge law is USMCA-ONLY and explicitly
 * FORBIDS TRANSP/TRK writes. Repairing it is a one-line backfill the moment that scope lifts.
 */
const KNOWN_LEGACY_UNLINKED = new Set(["e36c6aef-11d6-4285-8121-c3c646b9632f"]);

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** The reversing-entry probe. ROUND 393.2: a reclassification out-leg is excluded only when reclassify_batch_lines
 *  records exactly that line moved by exactly this entry (structural proof, never the memo). */
export function reversingSql(hasReclass) {
  return `
    WITH reversing AS (
      SELECT DISTINCT jep.journal_entry_uuid AS je_id
        FROM accounting.journal_entry_postings jep
       WHERE jep.reversal_of_line_id IS NOT NULL
         ${hasReclass ? `AND NOT EXISTS (
               SELECT 1 FROM accounting.reclassify_batch_lines bl
                WHERE bl.posting_id = jep.reversal_of_line_id
                  AND bl.reclass_journal_entry_id = jep.journal_entry_uuid
                  AND bl.result = 'applied')` : ""}
    )
    SELECT je.id::text                     AS je_id,
           je.operating_company_id::text   AS opco,
           je.entry_date::text             AS entry_date,
           je.memo                         AS memo,
           (je.reverses_je_id IS NULL)     AS missing_fk
      FROM reversing r
      JOIN accounting.journal_entries je ON je.id = r.je_id
     ORDER BY je.entry_date
`;
}

/** Verdict over the probe's rows: empty is unverifiable; a NULL FK not waived by id fails; repaired waivers are named. */
export function classifyReversals(rows, waivers) {
  const missing = rows.filter((r) => r.missing_fk);
  return {
    empty: rows.length === 0,
    missing,
    unexpected: missing.filter((r) => !waivers.has(r.je_id)),
    waived: missing.filter((r) => waivers.has(r.je_id)),
    staleWaivers: [...waivers].filter((id) => !missing.some((m) => m.je_id === id)),
  };
}

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  const W = new Set(["w1"]);
  ex("zero reversing entries is unverifiable, never a pass", classifyReversals([], W).empty === true);
  ex("a reversal without its JE-level FK fails", classifyReversals([{ je_id: "x", missing_fk: true }], W).unexpected.length === 1);
  ex("a waived legacy row is waived, not failed", (() => { const r = classifyReversals([{ je_id: "w1", missing_fk: true }], W); return r.unexpected.length === 0 && r.waived.length === 1; })());
  ex("a repaired waiver is named stale", classifyReversals([{ je_id: "a", missing_fk: false }], W).staleWaivers[0] === "w1");
  ex("linked reversals pass", (() => { const r = classifyReversals([{ je_id: "a", missing_fk: false }, { je_id: "w1", missing_fk: true }], W); return !r.empty && r.unexpected.length === 0; })());
  const withR = reversingSql(true), noR = reversingSql(false);
  ex("reclass exclusion is keyed on the exact line + entry + applied", /bl\.posting_id = jep\.reversal_of_line_id/.test(withR) && /bl\.reclass_journal_entry_id = jep\.journal_entry_uuid/.test(withR) && /bl\.result = 'applied'/.test(withR));
  ex("no reclass table -> no exclusion", !/reclassify_batch_lines/.test(noR) && /reversal_of_line_id IS NOT NULL/.test(noR));
  ex("probe never greps the memo", !/memo\s+(I?LIKE|~)/i.test(withR));
  console.log(ok ? `${LABEL} --selftest PASS (8/8)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  // FORCED RLS on accounting.*: without this every count reads 0 and the guard certifies a ledger it
  // never saw. SET LOCAL inside the txn — a bare SET does not reliably persist on a pooled connection.
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  // A reachable database is not a migrated one (ACCT-F333: CI hands this a fresh Postgres and a crash
  // then reads as a money FAIL).
  const present = await client.query(`SELECT to_regclass('accounting.journal_entries') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] SKIP — database reachable but the accounting schema is not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // ROUND 393.2 (ACCT-F2026100402, 7e1105eef6): a RECLASSIFICATION entry's out-leg names the ONE line it undoes
  // (reversal_of_line_id) — a line-level move, not a reversal of the original entry. It must NOT carry reverses_je_id:
  // that would mark the whole original entry reversed while its other lines (and the reclass in-leg) stay live. Such a
  // leg is excluded only when accounting.reclassify_batch_lines records exactly that line moved by exactly this entry —
  // structural proof, never the memo. Any other reversal leg still requires the JE-level FK.
  const hasReclass = (await client.query(`SELECT to_regclass('accounting.reclassify_batch_lines') IS NOT NULL AS present`)).rows[0]?.present;
  const { rows } = await client.query(reversingSql(hasReclass));
  await client.query("COMMIT");

  const { empty, missing, unexpected, waived, staleWaivers } = classifyReversals(rows, KNOWN_LEGACY_UNLINKED);
  // Completeness discriminator — a clean result over zero reversing entries proves nothing.
  if (empty) {
    fail(
      "no reversing journal entries found at all — that is an unverifiable read (RLS mask or empty DB), not a clean result"
    );
  }

  // A ratchet that silently shrinks is a ratchet that rots: if a waived row has been repaired, say so
  // loudly so the allowlist gets tightened rather than quietly outliving the defect.
  for (const id of staleWaivers) {
    console.log(`[${LABEL}] NOTE — waived row ${id} now carries its FK; remove it from KNOWN_LEGACY_UNLINKED to tighten the ratchet.`);
  }

  if (unexpected.length) {
    for (const r of unexpected) {
      console.error(
        ` - JE ${r.je_id} (opco ${r.opco}, ${r.entry_date}) owns reversal posting lines but reverses_je_id IS NULL — its reversal is invisible to every structural query and discoverable only by parsing the memo ${JSON.stringify(r.memo)}.`
      );
    }
    fail(
      `${unexpected.length} reversing journal entr(ies) carry no JE-level reversal FK. The reverser writes it (posting-engine.service.ts); a row without it was either written before that fix or by a path that bypasses the canonical reverser.`
    );
  }

  console.log(
    `[${LABEL}] PASS — ${rows.length} reversing journal entr(ies), ${rows.length - missing.length} carry the JE-level FK, ${waived.length} known legacy row(s) waived by id`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
