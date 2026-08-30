/**
 * ACCT-F10128 — GO-ACCT-01 DEFECT A, one-time backfill.
 *
 * ACCT-F10113 (PR #18201) wired the "customer_payment_deposit" sweep (Dr the matched bank's real
 * ledger_account_id / Cr the payment's holding account) to fire FORWARD-ONLY: at the moment
 * bank-recon MATCH accepts a payment against a real bank_transaction (match.service.ts). Any
 * payment that was ALREADY matched (source_bank_transaction_id already set) before that fix
 * deployed never got a second chance to sweep — its money sits in Undeposited Funds / cash_clearing
 * forever, and the real bank's cash GL never sees the debit. Confirmed live (GO-ACCT-01, 2026-08-30):
 * USMCA FREIGHT ledger, 259 postings, credits $177,411.20 vs debits $13,503.70 -- adjusted book
 * -$126,389.10.
 *
 * This script does NOT invent new GL math. It finds every payment that is deposit-sweep ELIGIBLE
 * by the poster's OWN definition (buildCustomerPaymentDepositSweepLines,
 * apps/backend/src/accounting/posting-engine.service.ts) but has no existing
 * customer_payment_deposit posting_batches row, and calls the SAME
 * postSourceTransactionInClientTx poster match.service.ts calls on every new match -- one
 * independent transaction per payment, so one ineligible/already-swept payment never blocks the
 * rest. Genuinely ineligible payments (voided, QBO-origin, no bank match, bank has no
 * ledger_account_id, or already posted straight to the bank) are expected, named skips -- never a
 * silent no-op, never a fabricated post.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-acct-f10128-deposit-sweep-backfill-once.mts            # dry run (lists eligible payments only)
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-acct-f10128-deposit-sweep-backfill-once.mts --commit    # apply
 */
import pg from "pg";
import { postSourceTransactionInClientTx, PostingEngineError } from "../apps/backend/src/accounting/posting-engine.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// Same skip list match.service.ts's own deposit-sweep call site uses -- expected, named no-ops.
// Any OTHER PostingEngineError, or any non-PostingEngineError, is a real failure and must surface.
const SKIPPABLE = new Set([
  "DEPOSIT_ALREADY_AT_BANK",
  "PAYMENT_NOT_POSTING_ELIGIBLE",
  "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED",
  "DEPOSIT_BANK_LEDGER_ACCOUNT_MISSING",
]);

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

type Candidate = { id: string; display_id: string | null; amount_cents: string; payment_date: string };

async function findCandidates(client: pg.PoolClient): Promise<Candidate[]> {
  const res = await client.query<Candidate>(
    `
      SELECT p.id::text, p.display_id, p.amount_cents::text, p.payment_date::text
      FROM accounting.payments p
      WHERE p.operating_company_id = $1::uuid
        AND p.voided_at IS NULL
        AND p.source_bank_transaction_id IS NOT NULL
        AND COALESCE(p.source_system, '') <> 'qbo'
        AND COALESCE(p.qbo_payment_id, '') = ''
        AND NOT EXISTS (
          SELECT 1 FROM accounting.posting_batches pb
          WHERE pb.operating_company_id = p.operating_company_id
            AND pb.source_transaction_type = 'customer_payment_deposit'
            AND pb.source_transaction_id = p.id::text
            AND pb.batch_status IN ('posted', 'in_progress')
        )
      ORDER BY p.payment_date, p.id
    `,
    [USMCA]
  );
  return res.rows;
}

async function cashGlTotals(client: pg.PoolClient) {
  const res = await client.query<{ debits: string; credits: string }>(
    `
      SELECT
        COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit'), 0)::text AS debits,
        COALESCE(SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit'), 0)::text AS credits
      FROM accounting.journal_entry_postings p
      JOIN banking.bank_accounts ba ON ba.ledger_account_id = p.account_id
      WHERE ba.operating_company_id = $1::uuid
        AND ba.account_name = 'USMCA FREIGHT'
    `,
    [USMCA]
  );
  return res.rows[0];
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const before = await cashGlTotals(client);
    console.log("BEFORE -- USMCA FREIGHT cash GL:", before);

    const candidates = await findCandidates(client);
    console.log(`ELIGIBLE (source_bank_transaction_id set, not yet swept): ${candidates.length}`);
    for (const c of candidates) {
      console.log(`  - payment ${c.id} (${c.display_id ?? "no display_id"}) $${(Number(c.amount_cents) / 100).toFixed(2)} on ${c.payment_date}`);
    }

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      return;
    }

    const results: { id: string; outcome: string }[] = [];
    for (const c of candidates) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
        await postSourceTransactionInClientTx(
          client,
          {
            operating_company_id: USMCA,
            source_transaction_type: "customer_payment_deposit",
            source_transaction_id: c.id,
          },
          { userId: ACTOR_USER_UUID }
        );
        await client.query("COMMIT");
        results.push({ id: c.id, outcome: "posted" });
        console.log(`  posted: ${c.id}`);
      } catch (e) {
        await client.query("ROLLBACK");
        if (e instanceof PostingEngineError && SKIPPABLE.has(e.code)) {
          results.push({ id: c.id, outcome: `skipped:${e.code}` });
          console.log(`  skipped (${e.code}): ${c.id}`);
        } else {
          throw e;
        }
      }
    }

    const after = await cashGlTotals(client);
    console.log("AFTER -- USMCA FREIGHT cash GL:", after);
    console.log("RESULTS:", results);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
