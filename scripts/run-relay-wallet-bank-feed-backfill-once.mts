/**
 * One-shot live backfill: integrations.relay_fuel_transactions → banking.bank_transactions
 * for TRANSP Relay Fuel Wallet. Commits every BATCH rows so progress is durable and visible.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/run-relay-wallet-bank-feed-backfill-once.mts
 */
import pg from "pg";
import { upsertRelayWalletBankFeedRow } from "../apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const BATCH = 40;
// POOLER LANDMINE (verified on prod 2026-08-04). This script sets SESSION-scoped GUCs
// (set_config(..., false)) and then relies on them across later statements. Neon's `-pooler` endpoint
// pools in TRANSACTION mode, so consecutive statements — even on a single dedicated client — can land
// on different server backends. The GUC is then absent, and because the tables are FORCE-RLS the query
// returns ZERO ROWS instead of erroring. A backfill silently processes nothing, or part of the set,
// and reports success. This exact failure skipped a row in the ACCT-F101 fuel reclass dry run.
// Prefer the DIRECT endpoint, where session state is stable; refuse the pooler rather than produce a
// silently-wrong answer.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
if (/-pooler\./.test(url)) {
  throw new Error(
    "REFUSING to run against the -pooler endpoint: this script uses session-scoped app.bypass_rls, " +
      "which does not survive transaction pooling. Under FORCE-RLS that yields ZERO ROWS silently. " +
      "Re-run with DATABASE_DIRECT_URL pointing at the direct (non-pooler) endpoint."
  );
}

type Row = {
  transaction_id: string;
  relay_created_at: string;
  total_amount_paid_cents: string;
  merchant_name: string | null;
  location_city: string | null;
  location_state: string | null;
  matched_unit_id: string | null;
  matched_unit_number: string | null;
  matched_driver_id: string | null;
  prompts: unknown;
  fuel_transaction_id: string | null;
};

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function countFeed(client: pg.PoolClient): Promise<number> {
  const r = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM banking.bank_transactions
     WHERE source_ref LIKE 'relay_fuel:%' AND operating_company_id=$1::uuid`,
    [TRANSP],
  );
  return r.rows[0].n;
}

const client = await pool.connect();
try {
  // is_local=false: session-scoped GUCs (is_local=true is a no-op outside BEGIN and hid all rows via RLS).
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [TRANSP]);

  const before = await countFeed(client);
  console.log("before_relay_bank_txns", before);

  const all = await client.query<Row>(
    `
      SELECT
        r.transaction_id,
        r.relay_created_at::text AS relay_created_at,
        r.total_amount_paid_cents::text AS total_amount_paid_cents,
        r.merchant_name,
        r.location_city,
        r.location_state,
        r.matched_unit_id::text AS matched_unit_id,
        r.matched_unit_number,
        r.matched_driver_id::text AS matched_driver_id,
        r.prompts,
        ft.id::text AS fuel_transaction_id
      FROM integrations.relay_fuel_transactions r
      LEFT JOIN fuel.fuel_transactions ft
        ON ft.operating_company_id = r.operating_company_id
       AND ft.transaction_reference = r.transaction_id
      WHERE r.operating_company_id = $1::uuid
        AND r.is_active = true
        AND r.voided_at IS NULL
      ORDER BY r.relay_created_at ASC
    `,
    [TRANSP],
  );
  console.log("relay_fuel_rows", all.rows.length);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < all.rows.length; i += BATCH) {
    const chunk = all.rows.slice(i, i + BATCH);
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await client.query(`SELECT set_config('app.operating_company_id',$1,true)`, [TRANSP]);
    try {
      for (const row of chunk) {
        const prompts = Array.isArray(row.prompts)
          ? (row.prompts as Array<{ label: string; value: string }>)
          : null;
        await client.query("SAVEPOINT relay_wallet_feed_row");
        try {
          const result = await upsertRelayWalletBankFeedRow(client, {
            operating_company_id: TRANSP,
            transaction_id: row.transaction_id,
            relay_created_at: row.relay_created_at,
            amount_cents: Number(row.total_amount_paid_cents),
            merchant_name: row.merchant_name,
            location_city: row.location_city,
            location_state: row.location_state,
            matched_unit_id: row.matched_unit_id,
            matched_unit_number: row.matched_unit_number,
            matched_driver_id: row.matched_driver_id,
            fuel_transaction_id: row.fuel_transaction_id,
            prompts,
          });
          await client.query("RELEASE SAVEPOINT relay_wallet_feed_row");
          if (result.status === "inserted") inserted += 1;
          else if (result.status === "updated") updated += 1;
          else skipped += 1;
        } catch (err) {
          await client.query("ROLLBACK TO SAVEPOINT relay_wallet_feed_row");
          failed += 1;
          if (failed <= 5) {
            console.error("row_failed", row.transaction_id, String(err).slice(0, 200));
          }
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    const mid = await countFeed(client);
    console.log(
      `batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(all.rows.length / BATCH)} feed_count=${mid} inserted=${inserted} updated=${updated} skipped=${skipped} failed=${failed}`,
    );
  }

  const after = await countFeed(client);
  console.log("after_relay_bank_txns", after);
  console.log("summary", JSON.stringify({ inserted, updated, skipped, failed }));
  if (after <= 0) {
    console.error("LIVE PROOF FAILED: still zero wallet bank feed rows");
    process.exit(2);
  }
  if (failed > 0) {
    console.error(`LIVE PROOF PARTIAL: ${failed} rows failed linkage (feed still has ${after})`);
  }
} finally {
  client.release();
  await pool.end();
}
