/**
 * R-161.1 follow-up — the reverse+reclose fix in 2026-09-25-cc1-r161-setb-deactivate-off-document-
 * escrow.ts did NOT resolve verify-escrow-balance-reconciles-gl's flagged drift for driver
 * c864a4bb-a7ff-4373-a5e1-c1590eefe3b7. Root-caused live (not guessed), after that fix ran:
 *
 * driver_finance.escrow_balances.current_balance_cents = 0, AND accounting.escrow_accounts.balance_cents
 * (the canonical source, owner ruling 2026-09-05) = 0 -- these two agree, and summing every
 * accounting.escrow_postings row for this driver (deposit/release, signed) nets to exactly 0. So
 * escrow_balances is CORRECT. The actual defect is driver_finance.escrow_ledger's own LAST row: its
 * `running_balance_cents` column is a value the WRITER computed and stored at write time
 * (recordEscrowContribution / the reverse path's mirror), not read back from the table after the
 * write -- and an earlier, unrelated manual correction on 2026-09-24 ("Sync projection to GL after
 * AT escrow excess release") set escrow_balances' real value without a matching ledger entry,
 * leaving every later entry's *recorded* running_balance_cents permanently offset from the table's
 * real value by a fixed 2500. This script appends exactly ONE more ledger row -- type 'correction',
 * amount_cents=0 (no real money movement, matches escrow_balances/escrow_accounts already agreeing)
 * -- recording the TRUE current running balance, the same "sync projection" pattern already used
 * once in this exact driver's own history. No UPDATE to any existing ledger row (append-only, as
 * this table already is everywhere else); no change to escrow_balances (already correct); no change
 * to the canonical accounting.escrow_accounts/escrow_postings (already correct).
 *
 * Touches exactly one new driver_finance.escrow_ledger row, for exactly this one driver.
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
const DRIVER_ID = "c864a4bb-a7ff-4373-a5e1-c1590eefe3b7";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const balRes = await client.query<{ id: string; current_balance_cents: string }>(
      `SELECT id::text, current_balance_cents::text FROM driver_finance.escrow_balances
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid`,
      [USMCA_ID, DRIVER_ID]
    );
    const balance = balRes.rows[0];
    if (!balance) throw new Error("escrow_balances row not found -- STOP");
    const canonicalRes = await client.query<{ balance_cents: string }>(
      `SELECT balance_cents::text FROM accounting.escrow_accounts WHERE operating_company_id = $1::uuid AND holder_id = $2::uuid`,
      [USMCA_ID, DRIVER_ID]
    );
    const canonical = canonicalRes.rows[0]?.balance_cents;
    if (canonical == null) throw new Error("accounting.escrow_accounts row not found -- STOP");
    if (canonical !== balance.current_balance_cents) {
      throw new Error(`escrow_balances (${balance.current_balance_cents}) != canonical accounting.escrow_accounts (${canonical}) -- STOP, this script only syncs the LEDGER's stale display value, it does not resolve a real balance mismatch`);
    }

    const ledgerRes = await client.query<{ running_balance_cents: string }>(
      `SELECT running_balance_cents::text FROM driver_finance.escrow_ledger
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        ORDER BY created_at DESC LIMIT 1`,
      [USMCA_ID, DRIVER_ID]
    );
    const lastLedgerBalance = ledgerRes.rows[0]?.running_balance_cents;
    if (lastLedgerBalance === balance.current_balance_cents) {
      console.log(`No drift: last ledger running_balance_cents (${lastLedgerBalance}) already matches escrow_balances (${balance.current_balance_cents}) -- nothing to do.`);
      await client.query("ROLLBACK");
      return;
    }
    console.log(`Drift confirmed: last ledger running_balance_cents=${lastLedgerBalance}, real current_balance_cents=${balance.current_balance_cents} (matches canonical accounting.escrow_accounts=${canonical}). Appending a correction entry.`);

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- not appending, rolling back.");
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `INSERT INTO driver_finance.escrow_ledger
         (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, running_balance_cents, description)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'correction', 0, $4, $5)`,
      [
        USMCA_ID,
        DRIVER_ID,
        balance.id,
        balance.current_balance_cents,
        `R-161.1 -- sync projection to GL: this driver's escrow_balances.current_balance_cents (${balance.current_balance_cents}) and the canonical accounting.escrow_accounts.balance_cents (${canonical}) already agree; the prior ledger entry's own recorded running_balance_cents was stale (offset by an unrelated 2026-09-24 manual correction). No money movement (amount_cents=0) -- records the true running balance going forward.`,
      ]
    );
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
