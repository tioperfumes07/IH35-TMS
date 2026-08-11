/**
 * ACCT-F333 — one-shot repair: reverse the GL of a VOIDED bill payment that was never reversed.
 *
 * WHAT HAPPENED: bill payment 8b68a9d7 (USMCA, $33.40) was voided 2026-08-07 through the UI path,
 * back when `voidBillPayment` hardcoded reversePostedGl=false (fixed since, by ACCT-F175). The
 * document read "void" while its DR A/P $33.40 stayed in the ledger — and that single line WAS the
 * entirety of USMCA's phantom A/P residual of +3,340 cents. Root cause is already fixed in code;
 * this repairs the one row that path left behind.
 *
 * ★ WHY THIS SCRIPT REVERSES ONE DOCUMENT AND NOT TWO. The defect was originally specified as "two
 * unreversed payments, 8b68a9d7 and 960f4ac5", from a probe that looked only at the
 * journal_entries.reverses_je_id chain. Live prod contradicts that: 960f4ac5 IS reversed, through the
 * LINE-level pointers (reversal_of_line_id / reversed_by_line_id), with reverses_je_id NULL because
 * its reversal (2026-08-08) predates the LV-INVOICE-VOID-REVERSAL fix that began populating the
 * JE-level FK. Reversing it again would have DOUBLE-REVERSED a correct document and swung A/P
 * +$88.88 the wrong way. The four-path precondition below is what makes that mistake impossible to
 * repeat — it is not ceremony.
 *
 * ★ THE REVERSER IS NOT IDEMPOTENT. A blind re-run reverses again. Hence: the precondition runs
 * INSIDE the same transaction as the write, and the transaction COMMITs only if the post-state
 * assertion passes. Any surprise rolls the whole thing back.
 *
 * Usage: DATABASE_DIRECT_URL=... npx tsx scripts/run-acct-f333-reverse-unreversed-bill-payment-once.mts
 *        add --commit to actually write; without it the script does a full dry run and rolls back.
 */
import pg from "pg";
import { reversePostedSourceTransactionInClientTx } from "../apps/backend/src/accounting/posting-engine.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PAYMENT_ID = "8b68a9d7-6b12-4a01-9116-9f58571ddf8b";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // the user who voided it
const BUSINESS_DATE = "2026-08-11";
const COMMIT = process.argv.includes("--commit");

// POOLER LANDMINE: this script sets session-scoped GUCs and then relies on them across later
// statements. Neon's -pooler endpoint pools in TRANSACTION mode, so the GUC can be absent on a later
// statement; under FORCE-RLS that returns ZERO ROWS instead of erroring, and a precondition that
// reads zero rows is exactly how a double-reversal gets approved. Refuse rather than be silently wrong.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING to run against the -pooler endpoint: session-scoped app.bypass_rls does not survive " +
      "transaction pooling, and under FORCE-RLS the precondition would read ZERO ROWS and pass. " +
      "Re-run with DATABASE_DIRECT_URL pointing at the direct (non-pooler) endpoint."
  );
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

/** Net DEBIT on USMCA A/P (2000) attributable to bill_payment postings, in cents. */
async function apFromBillPayments(): Promise<number> {
  const r = await client.query<{ net: string }>(
    `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS net
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id=$1::uuid AND je.status='posted'
        AND a.account_number='2000' AND jep.source_transaction_type='bill_payment'`,
    [USMCA]
  );
  return Number(r.rows[0].net);
}

/** Whole-ledger net for USMCA — double entry must stay balanced across the repair. */
async function ledgerNet(): Promise<number> {
  const r = await client.query<{ net: string }>(
    `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS net
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id=$1::uuid AND je.status='posted'`,
    [USMCA]
  );
  return Number(r.rows[0].net);
}

try {
  // is_local=false: session-scoped. is_local=true is a no-op outside BEGIN and would hide every row.
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);

  await client.query("BEGIN");

  // ── PRECONDITION, all four linkage paths, inside the write transaction ────────────────────────
  const pre = await client.query<{
    is_void: boolean; orig_jes: string; p1: string; p3: string; p4: string;
  }>(
    `SELECT (bp.revoked_at IS NOT NULL OR bp.status='void') AS is_void,
            (SELECT count(DISTINCT jep.journal_entry_uuid) FROM accounting.journal_entry_postings jep
              WHERE jep.source_transaction_type='bill_payment' AND jep.source_transaction_id=bp.id::text)::text AS orig_jes,
            (SELECT count(*) FROM accounting.transaction_source_links t
              WHERE t.linked_object_type='bill_payment' AND t.linked_object_id=bp.id::text
                AND t.relationship_role IN ('reversal_of','reversal'))::text AS p1,
            (SELECT count(*) FROM accounting.journal_entry_postings o
               JOIN accounting.journal_entries rev ON rev.reverses_je_id=o.journal_entry_uuid
              WHERE o.source_transaction_type='bill_payment' AND o.source_transaction_id=bp.id::text)::text AS p3,
            (SELECT count(*) FROM accounting.journal_entry_postings o
              WHERE o.source_transaction_type='bill_payment' AND o.source_transaction_id=bp.id::text
                AND o.reversed_by_line_id IS NOT NULL)::text AS p4
       FROM accounting.bill_payments bp
      WHERE bp.id=$1::uuid AND bp.operating_company_id=$2::uuid
      FOR UPDATE`,
    [PAYMENT_ID, USMCA]
  );
  const row = pre.rows[0];
  if (!row) throw new Error(`payment ${PAYMENT_ID} not found for USMCA — refusing (RLS mask or wrong entity)`);
  if (!row.is_void) throw new Error("payment is NOT void — this script only repairs the GL of an already-voided payment");
  if (Number(row.orig_jes) < 1) throw new Error("payment has no original posting — nothing to reverse");
  const alreadyReversed = ["p1", "p3", "p4"].filter((k) => Number((row as Record<string, string>)[k]) > 0);
  if (alreadyReversed.length) {
    throw new Error(
      `ABORT — payment already carries a reversal on path(s) ${alreadyReversed.join(", ")}. ` +
        `The reverser is NOT idempotent; proceeding would double-reverse. This is the 960f4ac5 case.`
    );
  }

  const apBefore = await apFromBillPayments();
  const netBefore = await ledgerNet();
  console.log(`[ACCT-F333] pre : A/P(bill_payment)=${apBefore}c · ledger net=${netBefore}c · paths p1=${row.p1} p3=${row.p3} p4=${row.p4}`);
  if (apBefore !== 3340) {
    throw new Error(`ABORT — expected A/P-from-bill_payments of exactly 3340c before repair, found ${apBefore}c. State changed; re-diagnose.`);
  }

  // ── THE WRITE, through the canonical reverser (never hand-rolled GL) ──────────────────────────
  const result = await reversePostedSourceTransactionInClientTx(
    client,
    { operating_company_id: USMCA, source_transaction_type: "bill_payment", source_transaction_id: PAYMENT_ID },
    { userId: ACTOR_USER_ID },
    BUSINESS_DATE
  );
  console.log(`[ACCT-F333] reversed → JE ${result.journal_entry_id} · batch ${result.posting_batch_id} · lines ${result.journal_entry_posting_ids.length}`);

  // ── POST-STATE ASSERTION — commit only if the ledger says the repair worked ────────────────────
  const apAfter = await apFromBillPayments();
  const netAfter = await ledgerNet();
  console.log(`[ACCT-F333] post: A/P(bill_payment)=${apAfter}c · ledger net=${netAfter}c`);
  if (apAfter !== 0) throw new Error(`ABORT — A/P from bill_payments should be 0c after repair, found ${apAfter}c`);
  if (netAfter !== netBefore) throw new Error(`ABORT — whole-ledger net moved ${netBefore}c → ${netAfter}c; a reversal must not change it`);
  if (netAfter !== 0) throw new Error(`ABORT — whole-ledger net is ${netAfter}c, not 0; double entry is broken`);

  if (COMMIT) {
    await client.query("COMMIT");
    console.log("[ACCT-F333] COMMITTED — A/P phantom +3,340c cleared.");
  } else {
    await client.query("ROLLBACK");
    console.log("[ACCT-F333] DRY RUN — all assertions passed, rolled back. Re-run with --commit to write.");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`[ACCT-F333] FAILED (rolled back): ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
