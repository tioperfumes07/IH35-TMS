#!/usr/bin/env tsx
/**
 * Lead 443.64 3b (AUTH-437): the last Creator street stop not on its fence's point. 13587 #2 Grupo MS (822 Union Pacific
 * Boulevard, Laredo) shares location 8cbff6c3 with 13540 #2 and 13568 #2; AUTH-435 moved that location + its fence (Samsara
 * 2000000762951, read back 18:41Z) to the Google rooftop point the other two stops resolved to (owner 443.53: addresses from
 * Google). The resolver keeps a stop's own stamped coordinates, so 13587 #2 stayed at the older geocoder point 345 m away.
 * The stop takes its location's point (geocode_source 'location_existing', audited), then one dispatch.relearn_load_miles
 * re-measures its legs on the server. No money, no DELETE, nothing in Samsara.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-64-13587-point.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-437 npx tsx scripts/ops/2026-10-11-cc2-443-64-13587-point.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { enqueueOutboxEvent } from "../../apps/backend/src/outbox/enqueue-outbox-event.js";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOCATION = "8cbff6c3-109b-422a-b64e-38ce74e35068";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-64-13587-point.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-437)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-437") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-437 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
if (apply) await assertIsIntendedProduction(client, { label: LABEL });
else if (forkCommit) await assertNotProduction(client, { label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const moved = (await client.query<{ id: string; load_id: string; old_lat: number; old_lng: number; lat: number; lng: number }>(
    `WITH lo AS (SELECT latitude::float8 lat, longitude::float8 lng FROM mdata.locations WHERE id = $2::uuid AND operating_company_id = $1::uuid)
     UPDATE mdata.load_stops s SET latitude = lo.lat, longitude = lo.lng, geocode_source = 'location_existing', geocode_attempted_at = now(), updated_at = now()
       FROM lo, mdata.loads l
      WHERE l.id = s.load_id AND l.operating_company_id = $1::uuid AND s.location_id = $2::uuid AND s.soft_deleted_at IS NULL
        AND (abs(s.latitude - lo.lat) > 0.0005 OR abs(s.longitude - lo.lng) > 0.0005)
      RETURNING s.id::text, s.load_id::text, lo.lat, lo.lng, 0::float8 old_lat, 0::float8 old_lng`, [USMCA, LOCATION])).rows;
  for (const m of moved) {
    await appendCrudAudit(client as never, OWNER, "mdata.load_stops.updated",
      { resource_id: m.id, resource_type: "mdata.load_stops", load_id: m.load_id, changes: { latitude: { to: m.lat }, longitude: { to: m.lng }, geocode_source: { to: "location_existing" } }, reason: "443.64 3b stop follows its location (822 Union Pacific, Google rooftop)" }, "info", "443.64");
    const r = await enqueueOutboxEvent(client as never, "dispatch.relearn_load_miles", { aggregate_type: "mdata.loads", aggregate_id: m.load_id },
      { operating_company_id: USMCA, load_id: m.load_id, actor_user_id: OWNER, record_sources: true }, `dispatch.relearn_load_miles:${m.load_id}:443.64-point`);
    console.log(`STOP ${m.id} -> ${m.lat},${m.lng}; relearn ${r.enqueued ? "enqueued" : "already queued"}`);
  }
  if (!moved.length) console.log("STOP: every stop on the location already at its point");
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
