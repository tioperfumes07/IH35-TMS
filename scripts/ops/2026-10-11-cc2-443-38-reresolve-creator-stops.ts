#!/usr/bin/env tsx
/**
 * ROUND 443.35 / 443.38 (owner 2026-10-11 00:25 / 00:30 CT; AUTH-409) — correct, THROUGH THE ENGINE, the stops, locations and
 * geofences the Settlement Creator loads got before the resolution order existed:
 *   1. every stop of every USMCA load booked since --since is re-resolved by geocodeStopsWithClient(..., { reresolve: true }):
 *      existing location with a street > the owner's Samsara address (street + its own fence, samsara_address_id) >
 *      owner-file street > zip / city center ('locality', zip_center / city_center, no location, no fence, listed);
 *   2. the zip-center fences drawn today (active, not Samsara-linked, on a location with no street) are RETIRED
 *      (is_active = false — history kept, nothing deleted);
 *   3. the street-less locations created today that no stop and no active fence uses any more are DEACTIVATED.
 * Nothing is deleted. Re-runnable: a second run finds every stop already resolved and every fence already retired.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-11-cc2-443-38-reresolve-creator-stops.ts                (dry run: rolled back)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-38-reresolve-creator-stops.ts --fork-commit  (fork: COMMIT)
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-409 npx tsx scripts/ops/2026-10-11-cc2-443-38-reresolve-creator-stops.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { geocodeStopsWithClient } from "../../apps/backend/src/telematics/stops-geocode-backfill.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const since = sinceArg ? sinceArg.slice("--since=".length) : "2026-10-11T00:00:00Z";
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint; use --apply with AUTH-409");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-409") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-409 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const counts = async (label: string) => {
  const r = (
    await client.query<Record<string, string>>(
      `WITH st AS (
         SELECT s.* FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
          WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND s.soft_deleted_at IS NULL AND l.status <> 'cancelled')
       SELECT (SELECT count(*) FROM st)::text stops,
              (SELECT count(*) FROM st WHERE address_line1 ~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S')::text with_street,
              (SELECT count(*) FROM st WHERE facility_name IS NOT NULL)::text with_facility,
              (SELECT count(*) FROM st WHERE geocode_source LIKE 'samsara_address%')::text on_samsara,
              (SELECT count(*) FROM st WHERE lower(coalesce(geocode_precision,'')) = 'rooftop' AND coalesce(address_line1,'') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S')::text false_rooftop,
              (SELECT count(*) FROM geo.geofences g JOIN mdata.locations lo ON lo.id = g.location_ref_id
                WHERE g.operating_company_id = $1::uuid AND g.is_active AND g.samsara_address_id IS NULL
                  AND g.created_at >= $2::timestamptz AND nullif(trim(lo.address_line1),'') IS NULL)::text zip_fences_active,
              (SELECT count(*) FROM geo.geofences WHERE operating_company_id = $1::uuid AND is_active AND samsara_address_id IS NOT NULL)::text samsara_fences_active`,
      [USMCA, since]
    )
  ).rows[0]!;
  console.log(`${label}: ${JSON.stringify(r)}`);
};

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await counts("BEFORE");

  const loads = (
    await client.query<{ id: string; load_number: string }>(
      `SELECT id::text, load_number FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND created_at >= $2::timestamptz AND status <> 'cancelled' AND soft_deleted_at IS NULL
        ORDER BY load_number`,
      [USMCA, since]
    )
  ).rows;
  let samsara = 0, listedN = 0, failed = 0;
  for (const l of loads) {
    const r = await geocodeStopsWithClient(client as never, OWNER, USMCA, l.id, { reresolve: true });
    samsara += r.samsara_matched;
    listedN += r.zip_center_listed.length;
    failed += r.failures.length;
    for (const z of r.zip_center_listed) console.log(`  LISTED load ${l.load_number} stop ${z.stop_id}: ${z.city ?? "?"}, ${z.state ?? "?"} ${z.postal_code ?? ""} — ${z.reason}`);
    for (const f of r.failures) console.log(`  FAILED load ${l.load_number} stop ${f.stop_id}: ${f.reason}`);
  }
  console.log(`Re-resolved ${loads.length} load(s): ${samsara} stop(s) on a Samsara address, ${listedN} at a zip / city center (listed), ${failed} failed.`);

  const retired = await client.query<{ id: string }>(
    `UPDATE geo.geofences g SET is_active = false, updated_at = now(), updated_by_user_uuid = $3::uuid
       FROM mdata.locations lo
      WHERE lo.id = g.location_ref_id AND g.operating_company_id = $1::uuid AND g.is_active
        AND g.samsara_address_id IS NULL AND g.created_at >= $2::timestamptz AND nullif(trim(lo.address_line1),'') IS NULL
      RETURNING g.id::text`,
    [USMCA, since, OWNER]
  );
  console.log(`Retired ${retired.rows.length} zip-center geofence(s) (is_active=false; history kept).`);
  const deactivated = await client.query<{ id: string }>(
    `UPDATE mdata.locations lo SET deactivated_at = now(), updated_at = now(), updated_by_user_id = $3::uuid
      WHERE lo.operating_company_id = $1::uuid AND lo.deactivated_at IS NULL AND lo.created_at >= $2::timestamptz
        AND nullif(trim(lo.address_line1),'') IS NULL
        AND NOT EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.location_id = lo.id AND s.soft_deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM geo.geofences g WHERE g.location_ref_id = lo.id AND g.is_active)
      RETURNING lo.id::text`,
    [USMCA, since, OWNER]
  );
  console.log(`Deactivated ${deactivated.rows.length} street-less location(s) no stop or fence uses.`);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await counts("AFTER");
  if (apply || forkCommit) {
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY RUN — rolled back.");
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
