/**
 * R-187 G4 (step 3 of 3): FAC-2026-00042 (Faro invoice 15, DARDINI LLC, 8/17/26) was missed from the
 * original R-159/AUTH-042 21-row wire-fee backfill. Unlike the cash_rsv rows this round, its LIVE
 * funding JE is ALREADY correctly split (confirmed live, journal_entry_postings): Dr 6400 Factoring
 * Fees $54.00, Dr 6300 Bank Service Charges & Wire Fees $10.00 -- the GL has always been right. Only
 * the STORED accounting.factoring_advances columns are stale: factor_fee_cents still shows the
 * pre-split blended $64.00, and wire_fee_cents was never backfilled at all. Pure metadata correction,
 * same shape as AUTH-042's own 21-row backfill -- no JE touched, no reversal, no repost.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DISPLAY_ID = "FAC-2026-00042";
const CORRECTED_FEE_CENTS = 5400; // matches the JE's own live 6400 leg exactly.
const WIRE_FEE_CENTS = 1000; // matches the JE's own live 6300 leg exactly.

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const before = await client.query<{ id: string; factor_fee_cents: string; wire_fee_cents: string | null }>(
        `SELECT id::text, factor_fee_cents::text, wire_fee_cents::text FROM accounting.factoring_advances WHERE display_id=$1 AND operating_company_id=$2::uuid`,
        [DISPLAY_ID, USMCA_ID]
      );
      if (!before.rows[0]) throw new Error(`STOP: ${DISPLAY_ID} not found`);
      if (Number(before.rows[0].factor_fee_cents) !== 6400 || before.rows[0].wire_fee_cents !== null) {
        throw new Error(`STOP: ${DISPLAY_ID} current shape unexpected: ${JSON.stringify(before.rows[0])}`);
      }

      // Confirm the live funding JE really does already carry the correct split before touching the
      // stored columns -- refuse rather than guess if it doesn't.
      const je = await client.query<{ account_number: string; amount_cents: string }>(
        `SELECT a.account_number, jep.amount_cents::text
           FROM accounting.journal_entry_postings jep
           JOIN catalogs.accounts a ON a.id = jep.account_id
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
          WHERE jep.source_transaction_id::text = $1 AND jep.source_transaction_type = 'factoring_advance'
            AND je.status = 'posted' AND je.reversed_by_je_id IS NULL
            AND a.account_number IN ('6400', '6300')`,
        [before.rows[0].id]
      );
      const fee6400 = je.rows.find((r) => r.account_number === "6400");
      const wire6300 = je.rows.find((r) => r.account_number === "6300");
      if (Number(fee6400?.amount_cents ?? -1) !== CORRECTED_FEE_CENTS || Number(wire6300?.amount_cents ?? -1) !== WIRE_FEE_CENTS) {
        throw new Error(`STOP: ${DISPLAY_ID}'s live JE does not show the expected 6400=${CORRECTED_FEE_CENTS}/6300=${WIRE_FEE_CENTS} split: ${JSON.stringify(je.rows)}`);
      }

      const upd = await client.query(
        `UPDATE accounting.factoring_advances SET factor_fee_cents=$2::bigint, wire_fee_cents=$3::bigint
          WHERE id=$1::uuid AND operating_company_id=$4::uuid AND factor_fee_cents=6400 AND wire_fee_cents IS NULL`,
        [before.rows[0].id, CORRECTED_FEE_CENTS, WIRE_FEE_CENTS, USMCA_ID]
      );
      if (upd.rowCount !== 1) throw new Error(`STOP: UPDATE affected ${upd.rowCount} rows`);

      await client.query("COMMIT");
      console.log(JSON.stringify({ display_id: DISPLAY_ID, factor_fee_cents_before: 6400, factor_fee_cents_after: CORRECTED_FEE_CENTS, wire_fee_cents_after: WIRE_FEE_CENTS }, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
