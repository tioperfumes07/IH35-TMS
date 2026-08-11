/**
 * ACCT-F335 — one-shot repair: give a reversing journal entry its JE-LEVEL reversal FK.
 *
 * USMCA JE 8fd32bec reverses d558f2a1 (the bill-payment posting for 960f4ac5). The pair is linked at the
 * LINE level but reverses_je_id / reversed_by_je_id are NULL, because the reversal (2026-08-08) predates
 * the LV-INVOICE-VOID-REVERSAL fix that began populating those columns. The reverser writes them today;
 * this repairs the row it predates.
 *
 * WHY IT IS WORTH REPAIRING RATHER THAN TOLERATING: a NULL here makes the reversal invisible to every
 * structural query. This exact NULL is why ACCT-F333's probe reported 960f4ac5 as UNREVERSED and nearly
 * caused a $88.88 double-reversal on the go-live ledger.
 *
 * ★ THE PAIR IS PROVEN STRUCTURALLY, NOT FROM THE MEMO. The memo says "Reversal of d558f2a1", but a memo
 * is a string someone can reword or mistype, and this script writes an audit FK on the strength of it.
 * The precondition instead requires that EVERY reversal line of the reversing entry points, through
 * reversal_of_line_id, at a line owned by the claimed original — and that the two entries are equal and
 * opposite. If the memo and the line pointers ever disagreed, this refuses to write.
 *
 * ENTITY SCOPE: USMCA ONLY (2026-08-11 weekend merge law). TRANSP's e36c6aef has the identical defect and
 * is deliberately NOT touched here; it is waived by id in guard 3053 with that reason recorded.
 *
 * Usage: npx tsx scripts/run-acct-f335-backfill-je-level-reversal-fk-once.mts [--commit]
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const REVERSAL_JE = "8fd32bec-4d6c-4b8d-93ad-d5f48754f81f";
const ORIGINAL_JE = "d558f2a1-2dbf-46ff-946a-907002a17b8a";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING to run against the -pooler endpoint: session-scoped app.bypass_rls does not survive " +
      "transaction pooling, and under FORCE-RLS the precondition would read ZERO ROWS and pass."
  );
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);
  await client.query("BEGIN");

  // ── Both entries exist, belong to USMCA, and neither FK is already set ────────────────────────
  const jes = await client.query<{ id: string; opco: string; reverses: string | null; reversed_by: string | null }>(
    `SELECT id::text, operating_company_id::text AS opco, reverses_je_id::text AS reverses,
            reversed_by_je_id::text AS reversed_by
       FROM accounting.journal_entries
      WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid
      FOR UPDATE`,
    [[REVERSAL_JE, ORIGINAL_JE], USMCA]
  );
  if (jes.rows.length !== 2) {
    throw new Error(`expected both JEs under USMCA, found ${jes.rows.length} — refusing (RLS mask or wrong entity)`);
  }
  const rev = jes.rows.find((r) => r.id === REVERSAL_JE)!;
  const orig = jes.rows.find((r) => r.id === ORIGINAL_JE)!;
  if (rev.reverses) throw new Error(`reversal JE already has reverses_je_id=${rev.reverses} — nothing to backfill`);
  if (orig.reversed_by) throw new Error(`original JE already has reversed_by_je_id=${orig.reversed_by} — nothing to backfill`);

  // ── STRUCTURAL PROOF: every reversal line points at a line owned by the claimed original ───────
  const link = await client.query<{ rev_lines: string; linked_to_original: string; other_targets: string }>(
    `SELECT count(*)::text AS rev_lines,
            count(*) FILTER (WHERE o.journal_entry_uuid = $2::uuid)::text AS linked_to_original,
            count(*) FILTER (WHERE o.journal_entry_uuid <> $2::uuid)::text AS other_targets
       FROM accounting.journal_entry_postings r
       JOIN accounting.journal_entry_postings o ON o.id = r.reversal_of_line_id
      WHERE r.journal_entry_uuid = $1::uuid AND r.reversal_of_line_id IS NOT NULL`,
    [REVERSAL_JE, ORIGINAL_JE]
  );
  const { rev_lines, linked_to_original, other_targets } = link.rows[0];
  if (Number(rev_lines) === 0) throw new Error("reversing JE owns no reversal lines — it is not a reversal; refusing");
  if (Number(other_targets) > 0) {
    throw new Error(`${other_targets} reversal line(s) point at a DIFFERENT journal entry than the memo claims — refusing to write an audit FK on a contradiction`);
  }
  if (rev_lines !== linked_to_original) throw new Error("not every reversal line resolves to the claimed original — refusing");

  // ── Equal and opposite: the two entries must cancel exactly ───────────────────────────────────
  const bal = await client.query<{ combined_net: string; rev_net: string; orig_net: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS combined_net,
            COALESCE(sum(CASE WHEN journal_entry_uuid=$1::uuid THEN (CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END) ELSE 0 END),0)::text AS rev_net,
            COALESCE(sum(CASE WHEN journal_entry_uuid=$2::uuid THEN (CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END) ELSE 0 END),0)::text AS orig_net
       FROM accounting.journal_entry_postings
      WHERE journal_entry_uuid = ANY(ARRAY[$1,$2]::uuid[])`,
    [REVERSAL_JE, ORIGINAL_JE]
  );
  console.log(`[ACCT-F335] pre : rev_lines=${rev_lines} all linked to original · nets rev=${bal.rows[0].rev_net}c orig=${bal.rows[0].orig_net}c combined=${bal.rows[0].combined_net}c`);
  if (bal.rows[0].combined_net !== "0") throw new Error(`the two entries do not cancel (combined net ${bal.rows[0].combined_net}c) — refusing`);

  // ── THE WRITE: audit linkage only. No posting line is created, altered or removed. ─────────────
  const a = await client.query(
    `UPDATE accounting.journal_entries SET reverses_je_id=$2::uuid, updated_at=now()
      WHERE id=$1::uuid AND operating_company_id=$3::uuid AND reverses_je_id IS NULL`,
    [REVERSAL_JE, ORIGINAL_JE, USMCA]
  );
  const b = await client.query(
    `UPDATE accounting.journal_entries SET reversed_by_je_id=$2::uuid, updated_at=now()
      WHERE id=$1::uuid AND operating_company_id=$3::uuid AND reversed_by_je_id IS NULL`,
    [ORIGINAL_JE, REVERSAL_JE, USMCA]
  );
  if (a.rowCount !== 1 || b.rowCount !== 1) throw new Error(`expected 1 row updated each way, got ${a.rowCount}/${b.rowCount}`);

  // ── POST-STATE: the FKs resolve both ways, and NOT ONE posting line moved ──────────────────────
  const post = await client.query<{ ok: boolean; lines: string; net: string }>(
    `SELECT (r.reverses_je_id = o.id AND o.reversed_by_je_id = r.id) AS ok,
            (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = ANY(ARRAY[$1,$2]::uuid[]))::text AS lines,
            (SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0) FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = ANY(ARRAY[$1,$2]::uuid[]))::text AS net
       FROM accounting.journal_entries r JOIN accounting.journal_entries o ON o.id = $2::uuid
      WHERE r.id = $1::uuid`,
    [REVERSAL_JE, ORIGINAL_JE]
  );
  console.log(`[ACCT-F335] post: fk_both_ways=${post.rows[0].ok} · lines=${post.rows[0].lines} · combined net=${post.rows[0].net}c`);
  if (!post.rows[0].ok) throw new Error("FKs do not resolve both ways after the write");
  if (post.rows[0].lines !== "4" || post.rows[0].net !== "0") throw new Error("posting lines changed — an audit backfill must never touch the ledger");

  if (COMMIT) {
    await client.query("COMMIT");
    console.log("[ACCT-F335] COMMITTED — JE-level reversal FK backfilled (audit linkage only, ledger untouched).");
  } else {
    await client.query("ROLLBACK");
    console.log("[ACCT-F335] DRY RUN — all assertions passed, rolled back. Re-run with --commit to write.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[ACCT-F335] FAILED (rolled back): ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
