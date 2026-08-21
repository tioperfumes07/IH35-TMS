/**
 * U6 1/6 — INBOX-CC-1.md "load.banking:gl_je: create a real USMCA load-tagged bank path +
 * balanced JE (reuse poster)."
 *
 * Tags a real, existing, pending_categorization USMCA bank transaction to a real, existing USMCA
 * load (categorization_load_id) and a real GL expense account (categorization_gl_account_id —
 * "5000 Fuel & Diesel", matching the transaction's own real description: "CHECKCARD 08/20 FUEL
 * AMERICA TRAVEL CE" — this closes `load.banking:gl_je`/`load.banking:bank` AND doubles as the
 * "real fuel" scenario event from the same INBOX order, since it's a genuine fuel-station charge).
 *
 * Reuses the EXISTING poster (`maybePostBankCategorizationToGl`, CHAIN-05/BLOCK-03) — no new GL
 * math written here. The categorization UPDATE mirrors exactly what
 * apps/backend/src/banking/categorization.routes.ts's POST /transactions/:id/categorize route
 * does inline (tagging metadata only, not a GL posting) before calling the same poster function.
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-load-banking-gl-je-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-load-banking-gl-je-once.mts --commit  # apply
 */
import pg from "pg";
import { maybePostBankCategorizationToGl } from "../apps/backend/src/banking/bank-feed-gl-posting.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const BANK_TXN_ID = "4a6cc040-686c-4e44-af98-bacfb1951a3c"; // CHECKCARD 08/20 FUEL AMERICA TRAVEL CE, $51.96
const LOAD_ID = "8df23e68-e1c0-415f-8397-40528bb3b499"; // L-20260816-0168, dispatched
const FUEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // 5000 Fuel & Diesel (CostOfGoodsSold)

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string — session GUCs (app.bypass_rls / app.operating_company_id) do not survive pgbouncer transaction pooling under FORCE RLS. Strip '-pooler' from the hostname.");
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const before = await client.query(
      `SELECT id, status, categorization_load_id, categorization_gl_account_id, matched_journal_entry_id
         FROM banking.bank_transactions WHERE id = $1::uuid`,
      [BANK_TXN_ID]
    );
    console.log("BEFORE:", before.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    await client.query("BEGIN");
    try {
      const upd = await client.query(
        `
          UPDATE banking.bank_transactions
          SET status = 'categorized',
              category = 'expense',
              category_kind = 'Vehicle Expenses::Fuel & Diesel',
              categorization_gl_account_id = $2::uuid,
              categorization_load_id = $3::uuid,
              categorization_memo = 'U6 1/6 -- real USMCA load-tagged bank path + balanced JE (INBOX-CC-1.md)',
              skip_reason = NULL,
              investigate_note = NULL,
              categorized_at = now(),
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $4::uuid
            AND status = 'pending_categorization'
          RETURNING id
        `,
        [BANK_TXN_ID, FUEL_ACCOUNT_ID, LOAD_ID, USMCA]
      );
      if (upd.rowCount !== 1) throw new Error(`expected 1 row updated, got ${upd.rowCount}`);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const result = await maybePostBankCategorizationToGl({
      companyId: USMCA,
      actorUserUuid: ACTOR_USER_UUID,
      bankTransactionId: BANK_TXN_ID,
    });
    console.log("POSTER RESULT:", JSON.stringify(result, null, 2));

    const after = await client.query(
      `SELECT id, status, categorization_load_id, categorization_gl_account_id, matched_journal_entry_id, review_state
         FROM banking.bank_transactions WHERE id = $1::uuid`,
      [BANK_TXN_ID]
    );
    console.log("AFTER:", after.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
