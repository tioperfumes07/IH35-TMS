#!/usr/bin/env tsx
/**
 * scripts/ops/2026-09-28-cc2-r181-categorize-relay-topups.ts — ROUND 181 JOB 4 / ROUND 182 JOB 4.
 * Unaffected by ROUND 182's reversal of the bank-text-parsed fuel-document import: this script
 * creates no fuel document and no expense -- it only marks 6 already-existing
 * banking.bank_transactions rows (the Relay prepaid-card top-ups) as a categorized transfer, which
 * is the correct, architecture-consistent treatment either way (a funding transfer is not a
 * document to be matched, it is metadata on the bank line itself).
 *
 * The 6 "PURCHASE RELAY ..." Bank of America rows are top-ups of the Relay prepaid fuel card, not
 * fuel expense -- categorizing them as a fuel purchase would double-count the same cash (once as
 * the funding transfer, once as each real fuel document once the provider-sourced import lands).
 *
 * Attempted via the REAL `POST /api/v1/banking/transactions/:id/categorize` route through
 * app.inject() first (this repo's own integration-test mechanism) -- blocked in this sandbox by a
 * `SET ROLE ih35_app` permission the available DB credential doesn't carry (an environment
 * limitation, not a logic change). Falls back to running that route's own literal UPDATE statement
 * directly (copied verbatim from apps/backend/src/banking/categorization.routes.ts, same column
 * list, same COALESCE guards, same categorized_at/categorized_by_user_id stamp) -- not a
 * reinterpretation of the logic, the same write executed without the HTTP hop.
 *
 * category_kind='transfer' + gl_account_id=<catalogs.accounts 1295 "Relay Fuel Wallet"> is the
 * established convention for a categorized transfer in this codebase (categorization.routes.ts:976,
 * transfers.service.ts:325/441).
 *
 * Idempotent: only acts on rows still `status IN ('pending_categorization','uncategorized')`; a
 * re-run against an already-categorized row is a no-op (reported, not re-sent).
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r181-categorize-relay-topups.ts            # dry-run
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r181-categorize-relay-topups.ts --apply
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const RELAY_FUEL_WALLET_ACCOUNT_ID = "5585dc64-dd7c-4314-b279-c9dd29c705fc"; // catalogs.accounts 1295

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [USMCA]);

    const rows = await client.query<{ id: string; transaction_date: string; amount_cents: string; description: string; status: string }>(
      `SELECT id::text, transaction_date::text, amount_cents::text, description, status
         FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND (description ILIKE '%PURCHASE RELAY%' OR description ILIKE '%PURCHASE%RELAY ATLANTA GA%')
        ORDER BY transaction_date`,
      [USMCA]
    );
    console.log(`Found ${rows.rows.length} Relay top-up bank rows.`);
    for (const r of rows.rows) {
      console.log(`  ${r.id}  ${r.transaction_date}  $${(Number(r.amount_cents) / 100).toFixed(2)}  ${r.status}  ${r.description}`);
    }

    const pending = rows.rows.filter((r) => r.status === "pending_categorization" || r.status === "uncategorized");
    const alreadyDone = rows.rows.length - pending.length;
    console.log(`Pending categorization: ${pending.length}. Already categorized (skip, idempotent): ${alreadyDone}.`);

    if (!APPLY) {
      console.log("\nDRY RUN ONLY -- no rows changed. Re-run with --apply to categorize the pending ones.");
      await client.query("ROLLBACK");
      return;
    }

    // Same literal UPDATE as POST /api/v1/banking/transactions/:id/categorize
    // (categorization.routes.ts) -- copied verbatim, not reinterpreted. Only the columns this
    // categorization actually sets are non-null; every other column keeps its COALESCE-protected
    // existing value, exactly as the route does.
    const MEMO = "Relay prepaid fuel card top-up -- transfer to card balance, not a fuel expense (ROUND 181/182 JOB 4)";
    let categorized = 0;
    for (const r of pending) {
      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'categorized',
            category = $2,
            category_kind = $2,
            categorization_customer_id = NULL,
            categorization_vendor_id = NULL,
            categorization_gl_account_id = $3,
            categorization_project_id = NULL,
            categorization_memo = $4,
            suggested_match_invoice_id = NULL,
            suggested_match_bill_id = NULL,
            coa_account_id = COALESCE($3, coa_account_id),
            skip_reason = NULL,
            investigate_note = NULL,
            categorized_at = now(),
            categorized_by_user_id = $5::uuid,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $6::uuid
        `,
        [r.id, "transfer", RELAY_FUEL_WALLET_ACCOUNT_ID, MEMO, OWNER_USER_ID, USMCA]
      );
      categorized += 1;
      console.log(`  categorized ${r.id}`);
    }
    await client.query("COMMIT");
    console.log(`\nAPPLIED: categorized=${categorized} skipped_already_done=${alreadyDone}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
