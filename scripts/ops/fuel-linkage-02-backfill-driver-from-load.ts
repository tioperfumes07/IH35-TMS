#!/usr/bin/env tsx
// FUEL LINKAGE AUDIT (Lead, 2026-09-23): "2. driver_id (350) -- resolve from the load's assigned
// driver once load_id lands." Same safe pattern as fuel-linkage-01 (unit_id from load): a
// fuel_transactions row's OWN load_id, where already set, carries a single, deterministic
// assigned_primary_driver_id on mdata.loads -- not a name-string match, so it does NOT reopen the
// already-declared 91-row ambiguous-driver-name gap (that was resolving from a printed NAME on a
// statement, which can collide across mdata.drivers; this is a real, already-established FK).
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

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

  const candidates = await client.query<{ id: string; driver_id: string }>(
    `
      SELECT ft.id::text, l.assigned_primary_driver_id::text AS driver_id
        FROM fuel.fuel_transactions ft
        JOIN mdata.loads l ON l.id = ft.load_id
       WHERE ft.operating_company_id = $1::uuid
         AND ft.archived_at IS NULL
         AND ft.driver_id IS NULL
         AND l.assigned_primary_driver_id IS NOT NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Candidates (driver_id NULL, real load_id -> real assigned_primary_driver_id): ${candidates.rowCount}`);

  const residual = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
        FROM fuel.fuel_transactions ft
       WHERE ft.operating_company_id = $1::uuid
         AND ft.archived_at IS NULL
         AND ft.driver_id IS NULL
         AND (ft.load_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = ft.load_id AND l.assigned_primary_driver_id IS NOT NULL))
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Residual (no load_id, or load has no assigned_primary_driver_id either): ${residual.rows[0]!.n}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  let updated = 0;
  for (const r of candidates.rows) {
    await client.query(
      `UPDATE fuel.fuel_transactions SET driver_id = $1::uuid, updated_at = now(), updated_by_user_id = $2::uuid WHERE id = $3::uuid AND operating_company_id = $4::uuid AND driver_id IS NULL`,
      [r.driver_id, OWNER_USER_ID, r.id, USMCA_COMPANY_ID]
    );
    updated++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${updated} rows updated.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
