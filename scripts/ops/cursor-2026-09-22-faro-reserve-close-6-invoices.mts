#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-reserve-close-6-invoices.mts — ROUND 30.4, escrow-as-asset item.
 *
 * ONE-TIME correcting JE. NOT a standing poster — the poster is explicitly BLOCKED (see
 * docs/reconciliation/2026-09-22-faro-reserve-close-6-invoices.md) pending ingestion of Faro's
 * per-invoice fee/rebate split as a real field; building a recurring poster today would mean
 * inventing that split for every future close, which is exactly the guess this script refuses.
 *
 * Scope: the 6 invoices in the scoped Faro statement (import c1e27709-28f7-4886-860f-b9597ddad71a)
 * whose factor.faro_invoice_lines.reserve_amount_cents = 0 while every other line in the statement
 * has reserve_amount_cents = fee_amount_cents — the live signature of "this purchase's escrow has
 * already been resolved" per Faro's own export: 13512, 13513, 13524, FARO-003, FARO-011,
 * INV-2026-00007. Sum of their fee_amount_cents = $143.63 exactly (14363 cents), independently
 * re-derived live and matching the owner's own figure two ways.
 *
 * The $143.63 SPLIT into $8.22 fee-earned vs $135.41 cash-rebate is NOT derivable from anything in
 * factor.faro_invoice_lines (verified: no column separates them, advance_amount_cents =
 * net_amount_cents on all 6, chargeback_amount_cents = 0 on all 6) — it is sourced to Faro's own
 * reserve/funds-due report, cited by name in this entry's memo and in the reconciling-item
 * register, not re-derived from our own ledger. ASC 705-20: vendor consideration (the rebate) is
 * presumed a reduction of purchase price, not income — the $135.41 posts as a cash receipt
 * against the reserve asset, never as revenue.
 *
 * Entry (balanced, 143.63 = 143.63):
 *   DEBIT  6400 Factoring Fees (Expense)         $8.22   — fee Faro actually earned/retained
 *   DEBIT  1090 Undeposited Funds (Asset)       $135.41   — cash Faro returned (matches the
 *                                                            existing convention: factoring_advance
 *                                                            receipts already land in 1090, not 1000)
 *   CREDIT 1230 Factoring Reserves (Asset)      $143.63   — the resolved portion of the reserve
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-reserve-close-6-invoices.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-reserve-close-6-invoices.mts --apply
 */
import pg from "pg";
import { ensureOpenPeriod } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "../../apps/backend/src/accounting/journal-entry-type-resolver.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

const FEE_ACCOUNT_ID = "5612e135-8d7d-4083-b309-5b0e59089084"; // 6400 Factoring Fees, active
const UNDEPOSITED_FUNDS_ID = "09d53946-8e22-4126-867a-d94acfea9ff3"; // 1090
const FACTORING_RESERVES_ID = "165cc317-5c8b-4296-8aab-f5101f4a6815"; // 1230

const FEE_CENTS = 822;
const REBATE_CENTS = 13541;
const TOTAL_CENTS = FEE_CENTS + REBATE_CENTS; // 14363

const SIX_INVOICES = ["13512", "13513", "13524", "FARO-003", "FARO-011", "INV-2026-00007"];

const MEMO =
  "Faro reserve close, 6 invoices (13512, 13513, 13524, FARO-003, FARO-011, INV-2026-00007) — " +
  "$143.63 total resolved per Faro's own reserve/funds-due report (source document, not re-derived " +
  "from our ledger). Split $8.22 fee earned / $135.41 cash rebate is document-sourced; " +
  "factor.faro_invoice_lines carries no field that separates them. ASC 705-20: the $135.41 rebate " +
  "is a reduction of the factoring cost, not income.";

async function main() {
  console.log(`Six invoices: ${SIX_INVOICES.join(", ")}`);
  console.log(`Fee $${(FEE_CENTS / 100).toFixed(2)} + rebate $${(REBATE_CENTS / 100).toFixed(2)} = $${(TOTAL_CENTS / 100).toFixed(2)}`);

  if (!APPLY) {
    console.log("DRY-RUN — would post one balanced JE: DEBIT 6400 $8.22, DEBIT 1090 $135.41, CREDIT 1230 $143.63");
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    const postingDate = new Date().toISOString().slice(0, 10);
    await ensureOpenPeriod(client, USMCA, postingDate);

    // Idempotency: refuse if this exact memo has already been posted (never double-post a one-time entry).
    const existing = await client.query(
      `SELECT id FROM accounting.journal_entries WHERE operating_company_id = $1::uuid AND memo = $2 AND voided_at IS NULL LIMIT 1`,
      [USMCA, MEMO]
    );
    if (existing.rows[0]) {
      console.log(`Already posted: journal_entry ${existing.rows[0].id}. No-op.`);
      await client.query("ROLLBACK");
      return;
    }

    const typeColPresent = await hasJournalEntryTypeColumn(client);
    const typeId = typeColPresent ? await resolveJournalEntryTypeId(client, { source: "manual", memo: MEMO }) : null;

    const jeInsert = typeColPresent
      ? await client.query<{ id: string }>(
          `INSERT INTO accounting.journal_entries
             (operating_company_id, entry_date, memo, status, source, journal_entry_type_id,
              created_by_user_id, qbo_sync_pending, created_at, updated_at, is_sample_data)
           VALUES ($1::uuid, $2::date, $3, 'posted', 'manual', $4::uuid, $5::uuid, true, now(), now(), false)
           RETURNING id::text`,
          [USMCA, postingDate, MEMO, typeId, OWNER]
        )
      : await client.query<{ id: string }>(
          `INSERT INTO accounting.journal_entries
             (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending,
              created_at, updated_at, is_sample_data)
           VALUES ($1::uuid, $2::date, $3, 'posted', 'manual', $4::uuid, true, now(), now(), false)
           RETURNING id::text`,
          [USMCA, postingDate, MEMO, OWNER]
        );
    const jeId = jeInsert.rows[0].id;

    const lines: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }> = [
      { account_id: FEE_ACCOUNT_ID, debit_or_credit: "debit", amount_cents: FEE_CENTS, description: "Factoring fee earned on 6 closed Faro invoices — document-sourced split" },
      { account_id: UNDEPOSITED_FUNDS_ID, debit_or_credit: "debit", amount_cents: REBATE_CENTS, description: "Cash rebate returned on 6 closed Faro invoices — ASC 705-20, not income" },
      { account_id: FACTORING_RESERVES_ID, debit_or_credit: "credit", amount_cents: TOTAL_CENTS, description: "Reserve resolved on 6 closed Faro invoices" },
    ];

    let seq = 1;
    for (const line of lines) {
      await client.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
            amount_cents, description, source_transaction_type, source_transaction_id, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, 'faro_reserve_close', $8, now(), now())`,
        [USMCA, jeId, seq, line.account_id, line.debit_or_credit, line.amount_cents, line.description, jeId]
      );
      seq += 1;
    }

    await client.query("COMMIT");
    console.log(`Posted journal_entry ${jeId} on ${postingDate}, balanced at $${(TOTAL_CENTS / 100).toFixed(2)}.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
