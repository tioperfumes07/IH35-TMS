/**
 * ACCT-F345 — one-shot repair: re-post the two driver advances whose cash leg credited Undeposited
 * Funds instead of the bank the money actually left.
 *
 * Advances 2239fa7f ($250.00, ALFONSO HIDALGO CHAVEZ) and adfabf6d ($100.00, a sample driver) posted
 * DR Driver Cash Advance / CR 1090 Undeposited Funds, because the un-sourced disbursement fallback
 * resolved a RECEIPT-side clearing account. 1090 sits at -$350.00 (a negative asset) and Bank of
 * America is overstated by the same amount.
 *
 * METHOD — canonical only, no hand-written GL and no UPDATE of a posting row:
 *   1. reversePostedSourceTransactionInClientTx  → unwinds the wrong entry
 *   2. postSourceTransactionInClientTx with posting_purpose="repost" → re-posts through the SAME
 *      builder, which now resolves operating_bank (bound to 1000 by 202612481130) and credits the bank.
 *
 * ★ WHY REPOST AND NOT A CORRECTING JE: a manual reclass JE would net the balances right while leaving
 * the advance's own posting still pointing at the wrong account, so every per-document query would
 * keep reporting the defect and guard 3057 would stay red. Re-posting through the builder makes the
 * document itself correct, which is what "fixed" has to mean here.
 *
 * ★ REPOST IS THE PATH BANK-F03 WARNED ABOUT. Before repost_revision existed, the poster's batch
 * idempotency key ended in posting_purpose (initial_post|reversal only), so a re-post after a reversal
 * silently returned the ORIGINAL batch and the expense vanished from the books — proven on a prod fork,
 * 20 rows, fuel down $4,593.94. POSTING_ENGINE_SUPPORTS_REPOST is now true and the key carries a
 * revision, but this script does not take that on trust: it asserts a NEW journal entry id and NEW
 * posting lines crediting 1000, and refuses if the poster hands back anything it has seen before.
 *
 * Usage: npx tsx scripts/run-acct-f345-repost-advances-to-operating-bank-once.mts [--commit]
 *        REPAIR_URL may override the target (used to rehearse on a Neon fork before prod).
 */
import pg from "pg";
import {
  reversePostedSourceTransactionInClientTx,
  postSourceTransactionInClientTx,
} from "../apps/backend/src/accounting/posting-engine.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BUSINESS_DATE = "2026-08-11";
const ADVANCES = ["2239fa7f-114f-4273-b5ba-c04e7392c890", "adfabf6d-d63d-43a3-b7de-ccac23bc7f0c"];
const COMMIT = process.argv.includes("--commit");

const url = process.env.REPAIR_URL ?? process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("REPAIR_URL / DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING the -pooler endpoint: session-scoped app.bypass_rls does not survive transaction pooling, " +
      "and under FORCE RLS the preconditions would read ZERO ROWS and pass vacuously."
  );
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

/** Net DEBIT in cents on a USMCA account number, posted entries only. */
async function net(accountNumber: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS n
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id=$1::uuid AND je.status='posted'
        AND a.account_number=$2 AND a.operating_company_id=$1::uuid`,
    [USMCA, accountNumber]
  );
  return Number(r.rows[0].n);
}

async function ledgerNet(): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS n
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id=$1::uuid AND je.status='posted'`,
    [USMCA]
  );
  return Number(r.rows[0].n);
}

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);
  await client.query("BEGIN");

  // The fix must be deployed before the repair, or the repost recreates the same wrong entry.
  const roleRes = await client.query<{ account_number: string }>(
    `SELECT a.account_number FROM accounting.chart_of_accounts_roles r
       JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id=$1::uuid AND r.role='operating_bank' AND r.is_active = true`,
    [USMCA]
  );
  const bankNumber = roleRes.rows[0]?.account_number;
  if (!bankNumber) throw new Error("operating_bank is not bound for USMCA — apply 202612481130 first; refusing to repost into the same defect");
  console.log(`[ACCT-F345] operating_bank -> ${bankNumber}`);

  const beforeClearing = await net("1090");
  const beforeBank = await net(bankNumber);
  const beforeLedger = await ledgerNet();
  console.log(`[ACCT-F345] pre : 1090=${beforeClearing}c · ${bankNumber}=${beforeBank}c · ledger net=${beforeLedger}c`);
  if (beforeClearing !== -35000) throw new Error(`expected 1090 at -35000c before repair, found ${beforeClearing}c — state changed, re-diagnose`);

  const seenJes = new Set<string>();
  for (const advanceId of ADVANCES) {
    const priorJes = await client.query<{ id: string }>(
      `SELECT DISTINCT journal_entry_uuid::text AS id FROM accounting.journal_entry_postings
        WHERE source_transaction_type='driver_advance' AND source_transaction_id=$1`,
      [advanceId]
    );
    priorJes.rows.forEach((r) => seenJes.add(r.id));

    await reversePostedSourceTransactionInClientTx(
      client,
      { operating_company_id: USMCA, source_transaction_type: "driver_advance", source_transaction_id: advanceId },
      { userId: ACTOR_USER_ID },
      BUSINESS_DATE
    );
    const reposted = await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: USMCA,
        source_transaction_type: "driver_advance",
        source_transaction_id: advanceId,
        posting_purpose: "repost",
        repost_revision: 1,
      },
      { userId: ACTOR_USER_ID }
    );

    // BANK-F03 defence: a repost that silently returns a pre-existing batch is the failure mode.
    if (!reposted.journal_entry_id) throw new Error(`repost of ${advanceId} returned no journal entry`);
    if (seenJes.has(reposted.journal_entry_id)) {
      throw new Error(`repost of ${advanceId} returned an EXISTING journal entry ${reposted.journal_entry_id} — the BANK-F03 silent-no-op; refusing`);
    }
    const legs = await client.query<{ account_number: string; dc: string; amount_cents: string }>(
      `SELECT a.account_number, jep.debit_or_credit AS dc, jep.amount_cents::text
         FROM accounting.journal_entry_postings jep JOIN catalogs.accounts a ON a.id=jep.account_id
        WHERE jep.journal_entry_uuid=$1::uuid ORDER BY jep.line_sequence`,
      [reposted.journal_entry_id]
    );
    const creditLeg = legs.rows.find((l) => l.dc === "credit");
    if (creditLeg?.account_number !== bankNumber) {
      throw new Error(`repost of ${advanceId} credited ${creditLeg?.account_number}, expected ${bankNumber}`);
    }
    console.log(`[ACCT-F345] ${advanceId.slice(0, 8)} reposted → JE ${reposted.journal_entry_id.slice(0, 8)} · CR ${creditLeg.account_number}`);
  }

  const afterClearing = await net("1090");
  const afterBank = await net(bankNumber);
  const afterLedger = await ledgerNet();
  console.log(`[ACCT-F345] post: 1090=${afterClearing}c · ${bankNumber}=${afterBank}c · ledger net=${afterLedger}c`);
  if (afterClearing !== 0) throw new Error(`1090 should be 0c after repair, found ${afterClearing}c`);
  if (afterBank !== beforeBank - 35000) throw new Error(`${bankNumber} should fall by 35000c, went ${beforeBank} -> ${afterBank}`);
  if (afterLedger !== beforeLedger) throw new Error(`whole-ledger net moved ${beforeLedger} -> ${afterLedger}; a reclass must not change it`);

  if (COMMIT) {
    await client.query("COMMIT");
    console.log("[ACCT-F345] COMMITTED — 1090 back to 0, the $350 now credited to the bank it left.");
  } else {
    await client.query("ROLLBACK");
    console.log("[ACCT-F345] DRY RUN — all assertions passed, rolled back. Re-run with --commit to write.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[ACCT-F345] FAILED (rolled back): ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
