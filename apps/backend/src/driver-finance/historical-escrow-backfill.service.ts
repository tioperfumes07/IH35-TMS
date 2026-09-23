// C6-MONEY-JE-EXEMPT: this file has NO CALLER yet (see "NOT WIRED" below) and performs zero live
// writes in this commit -- it is exercised only by its own selftest. The escrow_balances/
// escrow_ledger INSERTs here track the driver-liability sub-ledger, a separate concept from the
// GL journal (same distinction ESCROW-LEDGER-SIGN-01 draws for escrow-ledger-sign.ts). When this
// writer is wired into the settlement-refeed feed day (once CC-1's driver_bill historical-
// backfill writer exists), the caller that invokes it is responsible for posting the balancing
// GL entry for that day's driver_bill/settlement document as a whole, the same way
// settlement-payrun-close.service.ts's recordEscrowContribution's own escrow write is covered by
// its caller's settlement-level JE, not by a JE inside the escrow helper itself.
/**
 * HISTORICAL ESCROW BACKFILL WRITER (owner ruling, Round 86, 2026-09-23): one of the seven
 * engines named as gating the purge -- "CC-3: ... escrow writer all 80." The settlement-refeed
 * orchestrator (~/Downloads/run_feed_day.py, the Lead's own script) plans an "escrow" step for
 * every settlement-document escrow line (feeder-input-02-settlement-expense-extract.py's
 * escrow_for_claims category, 80 real lines / -$2,000.00 across the 117-document corpus,
 * confirmed emitted in full) but explicitly "writes nothing itself -- the app's real create path
 * executes this plan." This is that create path's escrow half.
 *
 * WHY A NEW FILE, NOT A REUSE OF `recordEscrowContribution`
 * (settlement-payrun-close.service.ts) already does the same escrow_balances-upsert +
 * escrow_ledger-append shape for the LIVE pay-run-close flow, but it is tightly coupled to that
 * flow's own concerns (ESCROW_CAP_LABEL capping, an intentional settlement_id omission working
 * around a HELD migration) and is not exported. Reusing it here would mean either exporting and
 * loosening a live-flow-specific function for a use case it was never written for, or silently
 * inheriting behavior (the cap, the settlement_id omission) that may not apply to a historical
 * backfill. A new, narrow function with the one behavior this case needs is safer than stretching
 * an existing one to cover both.
 *
 * SIGN: derived from `transaction_type` via `signedEscrowLedgerAmountCents`
 * (escrow-ledger-sign.ts, ESCROW-LEDGER-SIGN-01) -- every settlement-document escrow line is a
 * HOLD (the driver's own settlement text: "escrow" deductions, never a release), so this writer
 * only ever calls it with `"hold"`. Never a raw or caller-guessed sign.
 *
 * IDEMPOTENT: no dedicated natural-key column exists on driver_finance.escrow_ledger (verified
 * live -- id/operating_company_id/driver_id/escrow_balance_id/settlement_id/settlement_line_id/
 * transaction_type/amount_cents/running_balance_cents/description/created_at/load_id, nothing
 * else), so idempotency is enforced the same way run_feed_day.py's own natural_key law expects:
 * re-running with the same (operating_company_id, driver_id, load_id, description) is a no-op,
 * not a duplicate. Matches the feeder's own natural key shape, `escrow:{load_number}:{n}`, which
 * is unique per line within a load and maps 1:1 onto this row's (load_id, description) pair.
 *
 * NOT WIRED to run_feed_day.py or any route yet -- CC-1's "stop writer" and the driver_bill
 * historical-backfill path it depends on (STEPS["escrow"]["needs"] = ["driver_bill"] in the
 * orchestrator) do not exist yet either, and are not this seat's lane
 * (apps/backend/src/dispatch/book-load.service.ts::createDriverBillArtifacts is CC-1's booking-
 * time pay computation, not an item-line historical-backfill writer). This function is the real,
 * tested, sign-correct escrow half, ready to be called once that caller exists. Per Round 85/86
 * law it performs NO write in this commit -- it is code, not a transaction row, and is exercised
 * only by its own selftest.
 */
import { signedEscrowLedgerAmountCents } from "./escrow-ledger-sign.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { recordEscrowPostingOnly } from "../accounting/escrow/service.js";

export type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type HistoricalEscrowHoldInput = {
  operating_company_id: string;
  driver_id: string;
  load_id: string;
  /** The settlement-document line's own description (e.g. "Driver Deduction-Escrow for Claims-2026"
   * from feeder-input-02-settlement-expense-extract.py's item resolution) -- also doubles as half
   * of the idempotency key (see module doc). */
  description: string;
  /** Positive magnitude in cents, as printed on the settlement document. This function derives the
   * sign; never pass an already-signed value. */
  amount_cents: number;
  actor_user_id: string;
};

export type HistoricalEscrowHoldOutcome =
  | { outcome: "created"; escrow_ledger_id: string; signed_amount_cents: number }
  | { outcome: "already_exists"; escrow_ledger_id: string };

export async function createHistoricalEscrowHold(
  client: QueryableClient,
  input: HistoricalEscrowHoldInput
): Promise<HistoricalEscrowHoldOutcome> {
  if (input.amount_cents <= 0) {
    throw new Error(
      `createHistoricalEscrowHold: amount_cents must be a positive magnitude (got ${input.amount_cents}) -- the sign is derived here, never passed in.`
    );
  }

  // Idempotency: same (opco, driver, load, description) is a no-op, matching the feeder's own
  // natural-key law (run_feed_day.py: "Re-running a day must not create a second anything.").
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
        FROM driver_finance.escrow_ledger
       WHERE operating_company_id = $1::uuid
         AND driver_id = $2::uuid
         AND load_id = $3::uuid
         AND description = $4
       LIMIT 1
    `,
    [input.operating_company_id, input.driver_id, input.load_id, input.description]
  );
  if (existing.rows[0]) {
    return { outcome: "already_exists", escrow_ledger_id: existing.rows[0].id };
  }

  // Same escrow_balances upsert shape as settlement-payrun-close.service.ts's
  // recordEscrowContribution -- current_balance_cents/total_held_cents are the pot's own
  // magnitude, unchanged by ESCROW-LEDGER-SIGN-01 (that fix is scoped to escrow_ledger.amount_cents
  // only).
  const newBalance = await client.query<{ current_balance_cents: string }>(
    `
      INSERT INTO driver_finance.escrow_balances
        (operating_company_id, driver_id, total_held_cents, current_balance_cents, last_updated_at)
      VALUES ($1::uuid, $2::uuid, $3, $3, now())
      ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET
        total_held_cents = driver_finance.escrow_balances.total_held_cents + $3,
        current_balance_cents = driver_finance.escrow_balances.current_balance_cents + $3,
        last_updated_at = now()
      RETURNING id::text AS id, current_balance_cents::text
    `,
    [input.operating_company_id, input.driver_id, input.amount_cents]
  );
  const balanceRow = newBalance.rows[0] as { id?: string; current_balance_cents: string } | undefined;
  if (!balanceRow?.id) {
    throw new Error("createHistoricalEscrowHold: escrow_balances upsert returned no id.");
  }

  const signedAmountCents = signedEscrowLedgerAmountCents("hold", input.amount_cents);
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.escrow_ledger
        (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents,
         running_balance_cents, description, load_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'hold', $4, $5, $6, $7::uuid)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.driver_id,
      balanceRow.id,
      signedAmountCents,
      Number(balanceRow.current_balance_cents),
      input.description,
      input.load_id,
    ]
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("createHistoricalEscrowHold: escrow_ledger insert returned no row.");

  // ACCT-R-01 (verify-acct-r01-escrow-canonical-write-path.mjs): keep the canonical GL-linked
  // liability balance (accounting.escrow_accounts.balance_cents, the figure
  // releaseDriverEscrowSeparation() trusts) in sync with the driver_finance side just written --
  // exact same call, same reasoning, as settlement-payrun-close.service.ts's own escrow write.
  // No second JE posted here (recordEscrowPostingOnly only appends the escrow_postings audit row;
  // the existing DB trigger, migration 0234, applies the balance delta) -- linked_journal_entry_id
  // is omitted because this writer does not post one yet (see the module's C6-MONEY-JE-EXEMPT
  // note above).
  await recordEscrowPostingOnly(client, {
    operating_company_id: input.operating_company_id,
    driver_id: input.driver_id,
    posting_type: "deposit",
    amount_cents: input.amount_cents,
    source_type: "driver_settlement",
    source_id: null,
    note: `${input.description} — settlement-refeed historical backfill, load ${input.load_id}`,
    posted_by_user_id: input.actor_user_id,
  });

  await appendCrudAudit(
    client,
    input.actor_user_id,
    "driver_finance.escrow_ledger.historical_backfill_hold",
    {
      escrow_ledger_id: row.id,
      operating_company_id: input.operating_company_id,
      driver_id: input.driver_id,
      load_id: input.load_id,
      description: input.description,
      amount_cents: input.amount_cents,
      signed_amount_cents: signedAmountCents,
    },
    "info",
    "SETTLEMENT-REFEED-ESCROW-WRITER"
  );

  return { outcome: "created", escrow_ledger_id: row.id, signed_amount_cents: signedAmountCents };
}
