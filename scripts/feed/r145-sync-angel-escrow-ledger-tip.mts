#!/usr/bin/env tsx
/**
 * AUTH-083 — insert one escrow_ledger tip row so Angel survivor ledger matches GL $200.00.
 *
 *   OWNER_AUTH_ID=AUTH-083 npx tsx scripts/feed/r145-sync-angel-escrow-ledger-tip.mts
 *   OWNER_AUTH_ID=AUTH-083 npx tsx scripts/feed/r145-sync-angel-escrow-ledger-tip.mts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "52037e93-484a-4659-ab60-cf2a78f4c647";
const APPLY = process.argv.includes("--apply");
const TARGET_CENTS = 20000;
const DELTA_CENTS = 7500;

const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("OWNER_AUTH_ID required");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], {
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const DATABASE_URL = process.env.DATABASE_URL.replace("-pooler.", ".");

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    const gl = await client.query<{ balance_cents: string }>(
      `SELECT balance_cents::text AS balance_cents
         FROM accounting.escrow_accounts
        WHERE operating_company_id = $1::uuid
          AND holder_type = 'driver'
          AND holder_id = $2::uuid
          AND status = 'active'`,
      [USMCA, DRIVER]
    );
    if (gl.rows.length !== 1 || Number(gl.rows[0]!.balance_cents) !== TARGET_CENTS) {
      throw new Error(`STOP: GL balance unexpected ${JSON.stringify(gl.rows)}`);
    }

    const bal = await client.query<{ id: string; current_balance_cents: string }>(
      `SELECT id::text AS id, current_balance_cents::text AS current_balance_cents
         FROM driver_finance.escrow_balances
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid`,
      [USMCA, DRIVER]
    );
    if (bal.rows.length !== 1 || Number(bal.rows[0]!.current_balance_cents) !== TARGET_CENTS) {
      throw new Error(`STOP: projection unexpected ${JSON.stringify(bal.rows)}`);
    }

    const tip = await client.query<{ running_balance_cents: string }>(
      `SELECT running_balance_cents::text AS running_balance_cents
         FROM driver_finance.escrow_ledger
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        ORDER BY created_at DESC, ctid DESC
        LIMIT 1`,
      [USMCA, DRIVER]
    );
    const tipCents = Number(tip.rows[0]?.running_balance_cents ?? "NaN");
    if (tipCents === TARGET_CENTS) {
      console.log("already synced — nothing to do");
      await client.query("ROLLBACK");
      return;
    }
    if (tipCents !== TARGET_CENTS - DELTA_CENTS) {
      throw new Error(`STOP: tip ${tipCents} ≠ ${TARGET_CENTS - DELTA_CENTS}; refusing arbitrary delta`);
    }

    console.log(
      `will INSERT ledger delta=+${DELTA_CENTS} tip ${tipCents}→${TARGET_CENTS} (GL=${TARGET_CENTS} proj=${TARGET_CENTS})`
    );
    if (!APPLY) {
      console.log("DRY-RUN — pass --apply to write");
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `INSERT INTO driver_finance.escrow_ledger (
         operating_company_id, driver_id, escrow_balance_id,
         transaction_type, amount_cents, running_balance_cents, description
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid,
         'correction', $4::bigint, $5::bigint,
         'AUTH-083 sync ledger tip to canonical GL accounting.escrow_accounts.balance_cents=20000'
       )`,
      [USMCA, DRIVER, bal.rows[0]!.id, DELTA_CENTS, TARGET_CENTS]
    );

    const after = await client.query<{ running_balance_cents: string }>(
      `SELECT running_balance_cents::text AS running_balance_cents
         FROM driver_finance.escrow_ledger
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        ORDER BY created_at DESC, ctid DESC
        LIMIT 1`,
      [USMCA, DRIVER]
    );
    if (Number(after.rows[0]!.running_balance_cents) !== TARGET_CENTS) {
      throw new Error(`STOP: tip after insert ${after.rows[0]!.running_balance_cents}`);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, tip_cents: TARGET_CENTS }));
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
