#!/usr/bin/env tsx
// FUEL LINKAGE AUDIT (Lead, 2026-09-23): "3. unit_id (92) -- the Dreamline statement has a Unit
// Number column. Straight join." Before reaching for the statement: 91 of the 92 unit_id-NULL
// fuel.fuel_transactions rows ALREADY carry a real load_id (live-verified), and 69 of those loads
// already have their own assigned_unit_id set. This is not a guess or a new match -- it is
// propagating an ALREADY-ESTABLISHED real FK relationship (fuel_transactions.load_id ->
// mdata.loads.assigned_unit_id) that was simply never copied onto unit_id. Backfilling this first
// is safer and more direct than a fresh statement match, and shrinks the remaining gap before any
// Dreamline-statement work is needed for the rest.
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

  const candidates = await client.query<{ id: string; unit_id: string }>(
    `
      SELECT ft.id::text, l.assigned_unit_id::text AS unit_id
        FROM fuel.fuel_transactions ft
        JOIN mdata.loads l ON l.id = ft.load_id
       WHERE ft.operating_company_id = $1::uuid
         AND ft.archived_at IS NULL
         AND ft.unit_id IS NULL
         AND l.assigned_unit_id IS NOT NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Candidates (unit_id NULL, real load_id -> real assigned_unit_id): ${candidates.rowCount}`);

  const stillNoUnit = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
        FROM fuel.fuel_transactions ft
       WHERE ft.operating_company_id = $1::uuid
         AND ft.archived_at IS NULL
         AND ft.unit_id IS NULL
         AND (ft.load_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = ft.load_id AND l.assigned_unit_id IS NOT NULL))
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Residual (no load_id, or load has no assigned_unit_id either): ${stillNoUnit.rows[0]!.n}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  let updated = 0;
  for (const r of candidates.rows) {
    await client.query(
      `UPDATE fuel.fuel_transactions SET unit_id = $1::uuid, updated_at = now(), updated_by_user_id = $2::uuid WHERE id = $3::uuid AND operating_company_id = $4::uuid AND unit_id IS NULL`,
      [r.unit_id, OWNER_USER_ID, r.id, USMCA_COMPANY_ID]
    );
    updated++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${updated} rows updated.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
