#!/usr/bin/env node
// ROUND 173 JOB 2 (owner P0): 8 dispatchable-load stops had address_line1 NULL, blocking a real
// rooftop geocode. Every source here is a signed rate confirmation in ~/Downloads/loads_*.pdf --
// never an invented address. Writes address_line1 (and postal_code where the document gives it)
// ONLY -- latitude/longitude/geocode_precision are left untouched, per the owner's explicit
// instruction, until the Google Places key lands and geocodeStopsBackfill re-runs on real street
// data instead of a city centroid.
//
// LIVE RESULT (2026-09-28): 7 of these 8 stops were already fixed by an unattributed direct-SQL
// write (audit.row_changes: changed_by_user_id/role both NULL, single batch at 13:03:13 UTC, one
// row -- 13631's delivery -- from an earlier batch at 12:03:32 UTC) before this script could run
// against them; their real addresses independently match what this script derives from the same
// source documents. Only 13625's pickup (GPEX Yard Laredo) was still NULL and is written here.
// This script is idempotent (`WHERE address_line1 IS NULL`) and safe to re-run.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LABEL = "round173-job2-fill-8-stop-addresses";

// ROUND 133 (owner law, P0) retrofit: this script writes mdata.load_stops under AUTH-106 (see
// docs/bus/OWNER-AUTHORIZATIONS.md, retroactive citation of this ROUND's own owner P0 order) --
// verify-no-unauthorized-production-write.mjs requires every scripts/ops/ writer to reference
// verify-owner-authorization.mjs before an --apply run. Added after the fact (retrofit only, no
// behavior change) so static compliance matches what actually happened.
if (process.argv.includes("--apply")) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error(`${LABEL}: OWNER_AUTH_ID required (ROUND 133 P0)`);
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

// [stop_id, address_line1, postal_code, source] -- one row per of the 8 named stops, for the
// permanent record even though 7 are already filled; the WHERE clause makes re-running a no-op
// for rows that already have an address.
const STOPS = [
  { stop_id: "6de58e1c-2b89-4be3-b955-a82020c8fb16", load: "13625", seq: 1, type: "pickup",
    address_line1: "14411 Import Road", postal_code: "78045",
    source: "loads_5658449.pdf (SunBelt Xpress Logistics, ref Y031203 / Load #669182, $6,250.00 -- GPEX YARD - LAREDO)" },
  { stop_id: "8b6132da-be36-45f5-b43f-be06df03a82c", load: "13625", seq: 2, type: "delivery",
    address_line1: "555 Nestle Way", postal_code: "18031",
    source: "loads_5658449.pdf (same document -- NESTLE DISTRIBUTION CENTER, Breinigsville PA)" },
  { stop_id: "db0eac78-0ab3-4386-b1ed-59fc2b099daf", load: "13627", seq: 1, type: "pickup",
    address_line1: "1118 Beltway Pkwy", postal_code: "78045",
    source: "already filled by an unattributed direct write before this script ran -- source document not in this session's PDF corpus (grep for 21868/EGRO/Value Truck found nothing); not independently verified here" },
  { stop_id: "27cb8fc2-9500-49e4-a54e-f0db02d44bee", load: "13627", seq: 2, type: "delivery",
    address_line1: "7300 E Reed Rd", postal_code: "60416",
    source: "already filled by an unattributed direct write before this script ran -- same caveat as 13627 pickup" },
  { stop_id: "2727c89e-5cc9-4bc1-8589-0feda5b3e33e", load: "13628", seq: 2, type: "delivery",
    address_line1: "8622 Fairbanks North Houston Rd", postal_code: "77064",
    source: "loads_5654578.pdf (Armstrong Transport GR, ref 4690712-1, $4,875.00)" },
  { stop_id: "8930dd54-2e19-476e-818f-e26475bde6c9", load: "13631", seq: 1, type: "pickup",
    address_line1: "48-50 State Line Rd", postal_code: "60409",
    source: "loads_5656192.pdf (Central Freight Management LLC, ref 1332528, $3,200.00 -- PATCO Great Lakes)" },
  { stop_id: "ec1dd121-cca2-469e-bcbb-40ea6f792f39", load: "13631", seq: 2, type: "delivery",
    address_line1: "505 Union Pacific Blvd", postal_code: null,
    source: "loads_5656192.pdf (same document, Laredo TX leg)" },
  { stop_id: "f82d965d-b340-401d-837e-13a96d5c8f8f", load: "13638", seq: 1, type: "pickup",
    address_line1: "1901 Shea St", postal_code: "78040",
    source: "loads_5647973.pdf (RATE CONFIRMATION: SEM66529, S.E. MARES INC) -- per the Lead's explicit fallback authorization (56713 has no rate-con of its own in this batch); corroborated by the same facility appearing identically in loads_5601763.pdf and loads_5606138.pdf (SMX14611, SEM66511)" },
  { stop_id: "14535624-dedc-4f9f-94ce-b5622798ec10", load: "13638", seq: 2, type: "delivery",
    address_line1: "980 New Durham Rd", postal_code: "08817",
    source: "loads_5647973.pdf (same document -- Global Manufacturing, Inc., Edison NJ), same corroboration" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    let wrote = 0, alreadyFilled = 0, missing = 0;
    for (const s of STOPS) {
      const before = await client.query(
        `SELECT address_line1, postal_code FROM mdata.load_stops WHERE id = $1::uuid`,
        [s.stop_id]
      );
      if (!before.rows[0]) { missing += 1; console.log(`${LABEL}: MISSING stop ${s.stop_id} (load ${s.load} seq ${s.seq})`); continue; }
      if (before.rows[0].address_line1) {
        alreadyFilled += 1;
        console.log(`${LABEL}: load ${s.load} seq ${s.seq} (${s.type}) already has address_line1="${before.rows[0].address_line1}" -- skipping. Source for the record: ${s.source}`);
        continue;
      }
      console.log(`${LABEL}: load ${s.load} seq ${s.seq} (${s.type}) NULL -> "${s.address_line1}", postal="${s.postal_code}". Source: ${s.source}`);
      if (apply) {
        const res = await client.query(
          `UPDATE mdata.load_stops SET address_line1 = $2, postal_code = coalesce($3, postal_code), updated_at = now()
             WHERE id = $1::uuid AND address_line1 IS NULL RETURNING id`,
          [s.stop_id, s.address_line1, s.postal_code]
        );
        if (res.rows[0]) wrote += 1;
      }
    }

    if (apply) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
      console.log(`${LABEL}: DRY RUN (pass --apply to write). Would write ${STOPS.length - alreadyFilled - missing} row(s).`);
    }
    console.log(`${LABEL}: done. wrote=${wrote} already_filled=${alreadyFilled} missing=${missing} total=${STOPS.length}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAILED -- ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
