#!/usr/bin/env tsx
// LOAD-ACTIVE-SET item 9 of 48 (Lead, 2026-09-23): 4 pre-settlement (status='delivered',
// presettlement_link_id NULL) loads carry trailer_type='dry_van' -- wrong on 3 reefers and a
// flatbed. mdata.loads has no physical-trailer-unit FK (trailer_id was already established this
// session as permanently absent -- fuel is a tractor event, not a trailer event); the two real
// columns are trailer_type (free text) and load_trailer_equipment_id (catalogs.load_trailer_
// equipment, an equipment-CLASS catalog, not a specific unit). Correcting both from AlwaysTrack's
// own equipment record, cited per load:
//
//   13610 -> AlwaysTrack unit 10202, 53' Reefer  -> trailer_type='refrigerated_van'
//   13612 -> AlwaysTrack unit FB-56210, 53' Flatbed -> trailer_type='flatbed'
//   13613 -> AlwaysTrack unit 10380, 53' Reefer  -> trailer_type='refrigerated_van'
//   13614 -> AlwaysTrack unit 10870, 53' Reefer  -> trailer_type='refrigerated_van'
//
// trailer_type string convention confirmed live (not guessed): other real loads in this same
// table already use lowercase snake-case matching the catalog's own code, lowercased
// ('dry_van', 'flatbed', 'refrigerated_van'). load_trailer_equipment_id set to match, from
// catalogs.load_trailer_equipment's own live rows (REFRIGERATED_VAN / FLATBED), keeping the two
// columns in sync for these 4 rows (a live check found other, unrelated rows where they already
// diverge -- not this script's job to fix that wider gap, only these 4 named loads).
//
// All 4 are status='delivered', presettlement_link_id IS NULL -- no settlement has been built yet,
// so there is no historical pay to re-correct; this lands before the first settlement math ever
// reads trailer_type for these loads.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const REFRIGERATED_VAN_ID = "ebff82d9-11d8-44ea-9561-e913d5fddc08";
const FLATBED_ID = "7f5c1b03-9ab2-47d8-a108-197ebeff04f9";

const CORRECTIONS: Array<{ load_number: string; trailer_type: string; load_trailer_equipment_id: string; source: string }> = [
  { load_number: "13610", trailer_type: "refrigerated_van", load_trailer_equipment_id: REFRIGERATED_VAN_ID, source: "AlwaysTrack unit 10202, 53' Reefer" },
  { load_number: "13612", trailer_type: "flatbed", load_trailer_equipment_id: FLATBED_ID, source: "AlwaysTrack unit FB-56210, 53' Flatbed" },
  { load_number: "13613", trailer_type: "refrigerated_van", load_trailer_equipment_id: REFRIGERATED_VAN_ID, source: "AlwaysTrack unit 10380, 53' Reefer" },
  { load_number: "13614", trailer_type: "refrigerated_van", load_trailer_equipment_id: REFRIGERATED_VAN_ID, source: "AlwaysTrack unit 10870, 53' Reefer" },
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  for (const c of CORRECTIONS) {
    const before = await client.query<{ id: string; status: string; presettlement_link_id: string | null; trailer_type: string | null }>(
      `SELECT id::text, status, presettlement_link_id::text, trailer_type FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
      [USMCA_COMPANY_ID, c.load_number]
    );
    const row = before.rows[0];
    if (!row) {
      console.log(`Load ${c.load_number}: NOT FOUND, skipping.`);
      continue;
    }
    if (row.status !== "delivered" || row.presettlement_link_id) {
      console.log(
        `Load ${c.load_number}: status=${row.status} presettlement_link_id=${row.presettlement_link_id} -- ` +
          `no longer pre-settlement, REFUSING to touch (a settlement may already depend on the current value).`
      );
      continue;
    }
    console.log(`Load ${c.load_number} (${row.id}): trailer_type ${row.trailer_type} -> ${c.trailer_type} (${c.source})`);

    if (!executeFlag) continue;
    await client.query(
      `UPDATE mdata.loads SET trailer_type = $1, load_trailer_equipment_id = $2::uuid, updated_at = now(), updated_by_user_id = $3::uuid
         WHERE id = $4::uuid AND operating_company_id = $5::uuid`,
      [c.trailer_type, c.load_trailer_equipment_id, OWNER_USER_ID, row.id, USMCA_COMPANY_ID]
    );
  }

  client.release();
  await pool.end();
  console.log(executeFlag ? "\nEXECUTE done." : "\nDRY RUN -- no writes made. Re-run with --execute to apply.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
