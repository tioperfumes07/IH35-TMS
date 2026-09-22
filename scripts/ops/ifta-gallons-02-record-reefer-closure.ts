#!/usr/bin/env tsx
// IFTA-GALLONS-02 CLOSED (Lead, 2026-09-23): all 5 live reefer_diesel rows are Relay purchases
// (source='other', relay_bridge=1) that Relay itself categorized as reefer AT THE PUMP -- that is
// the receipt. Tractor-tank fuel would have come through the same bridge as plain diesel. Ruling:
// reefer_diesel stays EXCLUDED from the IFTA taxable-gallon base PERMANENTLY (not "pending
// determination" anymore) -- the understated-not-overstated direction was already the safe hold,
// and it is now the confirmed answer. Recording the closure + the 5 txn_ refs as evidence, additive
// to each row's existing notes (append-only, never overwrite).
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const CLOSURE_TAG = "IFTA-GALLONS-02-CLOSED=relay_pump_categorized_reefer,excluded_permanent";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const rows = await client.query<{ id: string; transaction_reference: string | null; notes: string | null }>(
    `SELECT id::text, transaction_reference, notes FROM fuel.fuel_transactions
      WHERE operating_company_id = $1::uuid AND archived_at IS NULL AND fuel_type = 'reefer_diesel'`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Found ${rows.rowCount} live reefer_diesel rows.`);
  for (const r of rows.rows) {
    console.log(`  ${r.id} ref=${r.transaction_reference} notes="${r.notes}"`);
  }

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  let updated = 0;
  for (const r of rows.rows) {
    if ((r.notes ?? "").includes("IFTA-GALLONS-02-CLOSED")) continue; // idempotent
    const newNotes = `${r.notes ?? ""}; ${CLOSURE_TAG}`;
    await client.query(
      `UPDATE fuel.fuel_transactions SET notes = $1, updated_at = now(), updated_by_user_id = $2::uuid WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
      [newNotes, OWNER_USER_ID, r.id, USMCA_COMPANY_ID]
    );
    updated++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${updated} rows updated.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
