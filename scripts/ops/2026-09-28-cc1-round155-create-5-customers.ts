/**
 * ROUND 155.2.b — create the 5 real broker customers missing from mdata.customers for USMCA,
 * live-verified 2026-09-28 (the other 9 customer names in the 18-load booking PLAN already
 * exist and match exactly — case-insensitive, trimmed).
 *
 * Name strings are byte-for-byte the ones in scripts/ops/2026-09-28-lead-r147-book-18-current-loads.ts's
 * PLAN, since that script's resolver does lower(btrim(customer_name))=lower(btrim($2)) — any
 * spelling drift here creates a second, orphaned customer later. is_sample_data stays false —
 * these are real brokers off signed rate confirmations.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LABEL = "round155-create-5-customers";

const DRY = process.env.DRY_RUN === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!DRY && !REQUIRED_AUTH_ID) {
  console.error(`${LABEL}: OWNER_AUTH_ID env var is required for --apply (DRY_RUN=1 for dry run)`);
  process.exit(1);
}
if (!DRY) {
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID!], { stdio: "inherit" });
  } catch {
    console.error(`${LABEL}: AUTH ${REQUIRED_AUTH_ID} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md`);
    process.exit(1);
  }
}

// Byte-for-byte from the booking script's PLAN array.
const NAMES = [
  "TTS LLC",
  "Westgate Global Logistics",
  "LOGIMAX TRANSPORT INC",
  "RITE WAY LOGISTICS, INC",
  "C and A TRANSPORTATION & LOGISTICS INC",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: DATABASE_URL is required`);
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    for (const name of NAMES) {
      const existing = await client.query(
        `SELECT id FROM mdata.customers WHERE operating_company_id=$1 AND lower(btrim(customer_name))=lower(btrim($2))`,
        [USMCA, name],
      );
      if (existing.rowCount) {
        console.log(`SKIP (already exists): ${name}`);
        continue;
      }
      const ins = await client.query(
        `INSERT INTO mdata.customers (operating_company_id, customer_name, customer_type, is_sample_data, created_by_user_id)
         VALUES ($1, $2, 'broker', false, $3)
         RETURNING id::text, customer_name`,
        [USMCA, name, ACTOR_USER_ID],
      );
      console.log(`CREATED: ${ins.rows[0].customer_name} -> ${ins.rows[0].id}`);
    }

    // Verify: every one of the 5 now resolves to exactly 1 row, exact string match.
    let allGood = true;
    for (const name of NAMES) {
      const r = await client.query(
        `SELECT count(*)::int AS n FROM mdata.customers WHERE operating_company_id=$1 AND customer_name=$2 AND is_sample_data=false`,
        [USMCA, name],
      );
      const n = r.rows[0].n;
      console.log(`  VERIFY exact-string match '${name}': ${n}`);
      if (n !== 1) allGood = false;
    }
    if (!allGood) throw new Error("at least one customer name does not resolve to exactly 1 exact-string row after insert");

    if (DRY) {
      console.log("DRY RUN — rolling back.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAILED — ${(err as Error).message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
