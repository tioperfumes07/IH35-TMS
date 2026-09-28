// AUTH-090 — mint driver_finance.driver_bills for the 18 real rate-con loads (13622-13639) through
// the ONE real engine path (ensureDriverBillArtifactsForLoad -> createDriverBillArtifacts), using
// ONLY real, sourced miles_shortest (13631=1343.0mi, 13634=1368.0mi, both from their own signed
// rate con PDFs, set live 2026-09-28). The other 16 loads have NO real mileage source today:
//   - Samsara: integrations.samsara_vehicle_positions has no historical rows for the transit dates
//     (Sept 23-28); only current-moment pings exist.
//   - Rate con PDF "Miles:" field: only 13631 and 13634 carry one; the other 16 rate cons/CUSTOMER
//     CHARGES exports never state a mileage figure.
//   - PC*Miler/Trimble via /api/v1/dispatch/route-mileage (resolvePointMileage/OsrmProvider): this
//     route is DOCUMENTED to always return shortest_miles: null today -- the configured OSRM
//     "driving" profile is fastest-route weighting, and the repo provisions no distinct
//     shortest-BY-DISTANCE profile (loads.routes.ts ~line 592-604, guarded by
//     verify-miles-shortest-never-autofilled-from-catalog.mjs). Calling it would return null on
//     every one of the 16, not a real number.
// Per owner instruction 2026-09-28 ("do not invent mileage... record the exception and mint the
// other bills"): this script calls the real engine for ALL 18. It mints 2 real bills and lets the
// engine's own pre-existing P1 refusal gate (missingPayInputs/createDriverBillArtifacts, owner
// 2026-09-14) do exactly what it is built to do on the other 16 -- return
// {outcome:"refused_no_shortest_miles"} and append its own audit_events row
// (driver_finance.driver_bill.refused_no_shortest_miles). That audit row IS the exception record;
// nothing new is invented here.
import { Pool } from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { ensureDriverBillArtifactsForLoad } from "../../apps/backend/src/dispatch/book-load.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_NUMBERS = Array.from({ length: 18 }, (_, i) => String(13622 + i));

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const lookupClient = await pool.connect();
  let idByLoad: Map<string, string>;
  try {
    await lookupClient.query("BEGIN");
    await lookupClient.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const idRes = await lookupClient.query(
      `SELECT load_number, id::text FROM mdata.loads WHERE load_number = ANY($1::text[]) AND operating_company_id = $2::uuid`,
      [LOAD_NUMBERS, USMCA]
    );
    await lookupClient.query("ROLLBACK");
    idByLoad = new Map(idRes.rows.map((r: any) => [r.load_number, r.id]));
  } finally {
    lookupClient.release();
  }

  for (const ln of LOAD_NUMBERS) {
    const loadId = idByLoad.get(ln);
    if (!loadId) {
      console.log(`${ln}: SKIP -- load not found live`);
      continue;
    }
    try {
      const outcome = await withCurrentUser(OWNER, async (client) => {
        await setScopedCompanyContext(client as any, OWNER, USMCA);
        return ensureDriverBillArtifactsForLoad(client as any, {
          loadId,
          operatingCompanyId: USMCA,
          actorUserId: OWNER,
        });
      });
      console.log(`${ln}: ${JSON.stringify(outcome)}`);
    } catch (err: any) {
      console.log(`${ln}: ERROR ${err?.message ?? err}`);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
