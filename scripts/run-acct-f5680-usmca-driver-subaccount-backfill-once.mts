/**
 * ACCT-F5680 — run the EXISTING driver-subaccount backfill service (asset + escrow sub-accounts +
 * A/P vendor, reusing the exact per-hire provisioners, no new GL math) for USMCA's driver roster.
 * Discovered live while proving ACCT-F5678's settlement-close fix end-to-end: driver
 * c864a4bb-a7ff-4373-a5e1-c1590eefe3b7 has no provisioned escrow LIABILITY sub-account, so the
 * pay-run close cannot even compute an escrow contribution for the settlement — DRIVER_ESCROW_ACCOUNT_UNBOUND.
 *
 * Default mode = dry-run (report only, zero writes) — matches runDriverSubAccountBackfill's own
 * default-off apply gate. --commit passes apply=true.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5680-usmca-driver-subaccount-backfill-once.mts [--commit]
 */
import pg from "pg";
import { runDriverSubAccountBackfill } from "../apps/backend/src/accounting/driver-subaccount-backfill.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query(`RESET ROLE`);
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const who = await client.query<{ u: string }>(`SELECT current_user AS u`);
  console.log(`current_user=${who.rows[0].u}`);

  const report = await runDriverSubAccountBackfill(client as never, {
    operatingCompanyId: USMCA,
    apply: COMMIT,
    actorUserId: COMMIT ? ACTOR_USER_ID : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  client.release();
  await pool.end();
}
