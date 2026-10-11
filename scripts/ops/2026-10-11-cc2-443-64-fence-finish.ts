#!/usr/bin/env tsx
/**
 * Lead 443.64 3b (AUTH-435), owner: "We keep them and we need the real address geo fences." Measured 18:15Z (Samsara mirror
 * re-read 17:45Z): 297 Creator street stops, 297 with a fence, 296 with a Samsara copy; 295 fences on the stop's point.
 * The two that are not finished:
 *  A) 13543 AMERICOLD (1355 Railroad Avenue, Albertville AL): its fence 4937a83d (drawn 16:52Z after the city typo fix) has no
 *     Samsara copy, while Samsara already holds address 2000000762879 "ALBERTIVILLE, AL" at the SAME point (pushed 06:48Z from
 *     the typo stop). The fence adopts that existing address (no duplicate) and ONE samsara.update_geofence renames it in place
 *     to the facility + real street.
 *  B) 822 Union Pacific Boulevard, Laredo (13540 #2 MS World Wide, 13568 #2 Pacific Start - MS worldwide): the location's fence
 *     (Samsara 2000000762951) sits 345 m from the Google rooftop point both stops resolved to. The fence and its location move to
 *     that point (radius kept) and ONE samsara.update_geofence moves the Samsara copy in place by id.
 * Each step refuses unless its measured precondition still holds. Nothing created or deleted in Samsara; no DELETE; no money.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-64-fence-finish.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-435 npx tsx scripts/ops/2026-10-11-cc2-443-64-fence-finish.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { enqueueOutboxEvent } from "../../apps/backend/src/outbox/enqueue-outbox-event.js";
import { squareVerticesFromCenter } from "../../apps/backend/src/telematics/auto-geofence.service.js";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-64-fence-finish.ts";
const AMERICOLD_FENCE = "4937a83d-946d-4acb-ac52-1a42d6e6cfa2";
const AMERICOLD_SAMSARA = "2000000762879";
const UNION_PACIFIC_SAMSARA = "2000000762951";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-435)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-435") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-435 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const metres = (aLat: number, aLng: number, bLat: number, bLng: number) =>
  111320 * Math.hypot(aLat - bLat, (aLng - bLng) * Math.cos((aLat * Math.PI) / 180));

const client = new pg.Client({ connectionString: url });
await client.connect();
if (apply) await assertIsIntendedProduction(client, { label: LABEL });
else if (forkCommit) await assertNotProduction(client, { label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  // A) AMERICOLD adopts the Samsara address already at its point.
  const a = (await client.query<{ samsara_address_id: string | null; lat: number; lng: number; m_lat: number | null; m_lng: number | null; twins: number }>(
    `SELECT g.samsara_address_id, g.center_lat::float8 lat, g.center_lng::float8 lng, m.lat::float8 m_lat, m.lng::float8 m_lng,
            (SELECT count(*)::int FROM geo.geofences g2 WHERE g2.samsara_address_id = $2 AND g2.is_active AND g2.id <> g.id) twins
       FROM geo.geofences g LEFT JOIN integrations.samsara_addresses m ON m.samsara_address_id = $2 AND m.operating_company_id = g.operating_company_id AND m.deactivated_at IS NULL
      WHERE g.id = $1::uuid AND g.operating_company_id = $3::uuid AND g.is_active`, [AMERICOLD_FENCE, AMERICOLD_SAMSARA, USMCA])).rows[0];
  if (!a) console.log("A: fence not active — skipped");
  else if (a.samsara_address_id === AMERICOLD_SAMSARA) console.log("A: already adopted — skipped");
  else if (a.samsara_address_id) console.log(`A: fence already has Samsara ${a.samsara_address_id} — skipped`);
  else if (a.m_lat == null || a.twins > 0 || metres(a.lat, a.lng, a.m_lat!, a.m_lng!) > 50)
    throw new Error(`A refused: Samsara ${AMERICOLD_SAMSARA} not in mirror, held by another active fence, or not at the fence's point`);
  else {
    const label = "AMERICOLD — 1355 Railroad Avenue, Albertville, AL 35951";
    await client.query(`UPDATE geo.geofences SET samsara_address_id = $2, label = $3, updated_at = now(), updated_by_user_uuid = $4::uuid WHERE id = $1::uuid AND samsara_address_id IS NULL`,
      [AMERICOLD_FENCE, AMERICOLD_SAMSARA, label, OWNER]);
    await enqueueOutboxEvent(client as never, "samsara.update_geofence", { aggregate_type: "geo.geofences", aggregate_id: AMERICOLD_FENCE }, {
      operating_company_id: USMCA, geofence_id: AMERICOLD_FENCE, samsara_address_id: AMERICOLD_SAMSARA, latitude: a.lat, longitude: a.lng,
      label, formatted_address: "1355 Railroad Avenue, Albertville, AL 35951", actor_user_id: OWNER,
    }, `samsara.update_geofence:${AMERICOLD_FENCE}:443.64`);
    await appendCrudAudit(client as never, OWNER, "telematics.geofence.adopted_samsara_address",
      { operating_company_id: USMCA, geofence_id: AMERICOLD_FENCE, samsara_address_id: AMERICOLD_SAMSARA, distance_m: Math.round(metres(a.lat, a.lng, a.m_lat!, a.m_lng!)), label }, "info", "443.64");
    console.log(`A: fence ${AMERICOLD_FENCE} adopted Samsara ${AMERICOLD_SAMSARA} (${Math.round(metres(a.lat, a.lng, a.m_lat!, a.m_lng!))} m), rename enqueued`);
  }

  // B) 822 Union Pacific: move the fence + its location to the stops' Google rooftop point; update the Samsara copy in place.
  const b = (await client.query<{ fence_id: string; location_id: string; lat: number; lng: number; radius_m: number; s_lat: number; s_lng: number; n_points: number }>(
    `SELECT g.id::text fence_id, g.location_ref_id::text location_id, g.center_lat::float8 lat, g.center_lng::float8 lng, g.radius_m::float8 radius_m,
            min(s.latitude)::float8 s_lat, min(s.longitude)::float8 s_lng, count(DISTINCT (round(s.latitude::numeric,5), round(s.longitude::numeric,5)))::int n_points
       FROM geo.geofences g JOIN mdata.load_stops s ON s.location_id = g.location_ref_id AND s.soft_deleted_at IS NULL AND s.geocode_source = 'google_place'
      WHERE g.operating_company_id = $1::uuid AND g.is_active AND g.samsara_address_id = $2
      GROUP BY g.id`, [USMCA, UNION_PACIFIC_SAMSARA])).rows;
  if (b.length !== 1) throw new Error(`B refused: expected 1 active fence for Samsara ${UNION_PACIFIC_SAMSARA}, got ${b.length}`);
  const f = b[0]!;
  const off = metres(f.lat, f.lng, f.s_lat, f.s_lng);
  if (f.n_points !== 1) throw new Error("B refused: the location's Google stops do not share one point");
  if (off <= 50) console.log(`B: fence already on the stops' point (${Math.round(off)} m) — skipped`);
  else {
    const label = "MS World Wide — 822 Union Pacific Boulevard, Laredo, TX 78045";
    const radius = Number(f.radius_m) || 76;
    await client.query(
      `UPDATE geo.geofences SET center_lat = $2, center_lng = $3, vertices_json = $4::jsonb, label = $5, updated_at = now(), updated_by_user_uuid = $6::uuid
        WHERE id = $1::uuid`, [f.fence_id, f.s_lat, f.s_lng, JSON.stringify(squareVerticesFromCenter(f.s_lat, f.s_lng, radius * 2)), label, OWNER]);
    await client.query(`UPDATE mdata.locations SET latitude = $2, longitude = $3, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
      [f.location_id, f.s_lat, f.s_lng, USMCA]);
    await enqueueOutboxEvent(client as never, "samsara.update_geofence", { aggregate_type: "geo.geofences", aggregate_id: f.fence_id }, {
      operating_company_id: USMCA, geofence_id: f.fence_id, samsara_address_id: UNION_PACIFIC_SAMSARA, latitude: f.s_lat, longitude: f.s_lng,
      label, formatted_address: "822 Union Pacific Boulevard, Laredo, TX 78045", actor_user_id: OWNER,
    }, `samsara.update_geofence:${f.fence_id}:443.64`);
    await appendCrudAudit(client as never, OWNER, "telematics.geofence.moved_to_real_address",
      { operating_company_id: USMCA, geofence_id: f.fence_id, samsara_address_id: UNION_PACIFIC_SAMSARA, location_id: f.location_id, from: [f.lat, f.lng], to: [f.s_lat, f.s_lng], moved_m: Math.round(off) }, "info", "443.64");
    console.log(`B: fence ${f.fence_id} + location ${f.location_id} moved ${Math.round(off)} m to the Google point; Samsara ${UNION_PACIFIC_SAMSARA} update enqueued`);
  }

  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
