/**
 * ACCT-F5669 RUNTIME EXECUTION — post the USMCA bank-feed GL backlog through the CANONICAL poster.
 *
 * The fix PR (#13216, merged d6dc8daf) shipped POST /api/v1/banking/transactions/
 * post-categorized-backlog; this script is the same operation via the established run-once pattern
 * (precedent: run-acct-f333 / run-acct-f345 / run-p38 — import the REAL service function, exercise
 * the TRUE code path against prod; a hand-written SQL insert would prove nothing and is forbidden).
 *
 * What it does per stuck row (status='categorized' AND matched_journal_entry_id IS NULL):
 * calls maybePostBankCategorizationToGl — the CHAIN-05 poster with its own flag gate
 * (BANK_FEED_GL_POSTING_ENABLED, verified ON for USMCA live 2026-08-20), closed-period gate,
 * assertBalanced, idempotency (posting_batches unique key + matched_journal_entry_id-NULL guard)
 * and the BANK-F05 reversed-count repost discriminator. NO new GL math lives here.
 *
 * Lock-order: the id list is read on THIS script's own connection, fully materialized, BEFORE any
 * poster call — the poster self-connects (ACCT-F5651 lesson: never await it inside a held scope).
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5669-post-bank-backlog-once.mts [--commit]
 * Without --commit: read-only preview (lists the backlog, posts nothing).
 */
import pg from "pg";
import { maybePostBankCategorizationToGl } from "../apps/backend/src/banking/bank-feed-gl-posting.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING the -pooler endpoint: session-scoped app.bypass_rls does not survive transaction pooling, " +
      "and under FORCE RLS the backlog read would see ZERO ROWS and pass vacuously."
  );
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

async function counts(): Promise<{ stuck: number; with_je: number }> {
  const r = await client.query<{ stuck: string; with_je: string }>(
    `SELECT
       (SELECT COUNT(*) FROM banking.bank_transactions bt
         WHERE bt.operating_company_id = $1::uuid AND bt.status = 'categorized'
           AND bt.matched_journal_entry_id IS NULL)::text AS stuck,
       (SELECT COUNT(*) FROM banking.bank_transactions bt
         WHERE bt.operating_company_id = $1::uuid
           AND bt.matched_journal_entry_id IS NOT NULL)::text AS with_je`,
    [USMCA]
  );
  return { stuck: Number(r.rows[0].stuck), with_je: Number(r.rows[0].with_je) };
}

try {
  // Bypass as its OWN statement + completeness discriminator (standing 0-count law).
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const who = await client.query<{ u: string }>(`SELECT current_user AS u`);
  console.log(`current_user=${who.rows[0].u}`);

  const flag = await client.query<{ enabled: boolean | null }>(
    `SELECT enabled FROM lib.feature_flag_overrides
      WHERE flag_key = 'BANK_FEED_GL_POSTING_ENABLED' AND operating_company_id = $1::uuid`,
    [USMCA]
  );
  console.log(`BANK_FEED_GL_POSTING_ENABLED override: ${String(flag.rows[0]?.enabled)}`);

  const before = await counts();
  console.log(`BEFORE: stuck=${before.stuck} with_je=${before.with_je}`);

  const idsRes = await client.query<{ id: string }>(
    `SELECT bt.id::text AS id
       FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND bt.status = 'categorized'
        AND bt.matched_journal_entry_id IS NULL
      ORDER BY bt.transaction_date ASC, bt.created_at ASC`,
    [USMCA]
  );
  const backlogIds = idsRes.rows.map((r) => r.id);
  console.log(`backlog ids (${backlogIds.length}): ${backlogIds.join(", ")}`);

  if (!COMMIT) {
    console.log("DRY RUN — no --commit, nothing posted.");
  } else {
    let posted = 0;
    for (const id of backlogIds) {
      // Poster self-connects — invoked with NO transaction held on this script's connection.
      const res = await maybePostBankCategorizationToGl({
        companyId: USMCA,
        actorUserUuid: ACTOR_USER_ID,
        bankTransactionId: id,
      });
      console.log(`${id}: posted=${res.posted}${"reason" in res && res.reason ? ` reason=${res.reason}` : ""}${"message" in res && res.message ? ` — ${res.message}` : ""}`);
      if (res.posted) posted += 1;
    }
    const after = await counts();
    console.log(`AFTER: stuck=${after.stuck} with_je=${after.with_je} (posted ${posted}/${backlogIds.length})`);
  }
} finally {
  client.release();
  await pool.end();
}
