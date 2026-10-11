#!/usr/bin/env tsx
/**
 * Lead 443.63 (AUTH-434): "GO on learnLoadLanes for 13543 under a new AUTH; write google_place_id on stops/locations now the
 * column is live".
 *  1. google_place_id: every USMCA stop resolved by the Google place step (geocode_source 'google_place') takes the place_id
 *     its own latest "dispatch.load_stop.street_from_google_place" audit row recorded — only when that row's street is the
 *     stop's current street; its location takes the same id when the location has none. Audited per stop.
 *  2. 13543 (city corrected Albertville in AUTH-433): learnLoadLanes(fresh: true) counts the load once on its real lane
 *     Albertville, AL -> Temple, TX. The earlier observation on the typo lane "ALBERTIVILLE" stays (lane averages are never
 *     decremented or deleted) and is listed.
 * No money, no DELETE.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-63-place-id-and-lane.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-434 npx tsx scripts/ops/2026-10-11-cc2-443-63-place-id-and-lane.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { learnLoadLanes } from "../../apps/backend/src/dispatch/load-lane-learning.service.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-63-place-id-and-lane.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-434)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-434") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-434 (got ${JSON.stringify(auth || null)})`);
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

  const rows = (await client.query<{ stop_id: string; load_id: string; location_id: string | null; place_id: string }>(
    `SELECT s.id::text stop_id, s.load_id::text, s.location_id::text, a.pid place_id
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
       JOIN LATERAL (SELECT e.payload->>'google_place_id' pid, e.payload->>'address_line1' street FROM audit.audit_events e
                      WHERE e.event_class = 'dispatch.load_stop.street_from_google_place' AND e.payload->>'resource_id' = s.id::text
                      ORDER BY e.created_at DESC LIMIT 1) a ON true
      WHERE l.operating_company_id = $1::uuid AND s.soft_deleted_at IS NULL AND s.geocode_source = 'google_place'
        AND s.google_place_id IS NULL AND coalesce(a.pid, '') <> '' AND a.street = s.address_line1`, [USMCA])).rows;
  let stops = 0, locs = 0;
  for (const r of rows) {
    await client.query(`UPDATE mdata.load_stops SET google_place_id = $2, updated_at = now() WHERE id = $1::uuid AND google_place_id IS NULL`, [r.stop_id, r.place_id]);
    stops++;
    if (r.location_id) {
      const u = await client.query(`UPDATE mdata.locations SET google_place_id = $3, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid AND google_place_id IS NULL RETURNING id`, [r.location_id, USMCA, r.place_id]);
      locs += u.rows.length;
    }
    await appendCrudAudit(client as never, OWNER, "mdata.load_stops.updated",
      { resource_id: r.stop_id, resource_type: "mdata.load_stops", load_id: r.load_id, changes: { google_place_id: { to: r.place_id } }, location_id: r.location_id, reason: "443.63 place_id from its own Google audit row" }, "info", "443.63");
  }
  const cover = (await client.query<{ g: number; with_pid: number; loc_with_pid: number }>(
    `SELECT count(*)::int g, count(*) FILTER (WHERE s.google_place_id IS NOT NULL)::int with_pid,
            count(DISTINCT s.location_id) FILTER (WHERE lo.google_place_id IS NOT NULL)::int loc_with_pid
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id LEFT JOIN mdata.locations lo ON lo.id = s.location_id
      WHERE l.operating_company_id = $1::uuid AND s.soft_deleted_at IS NULL AND s.geocode_source = 'google_place'`, [USMCA])).rows[0]!;
  console.log(`PLACE_ID stops written ${stops}, locations written ${locs}; google_place stops ${cover.g}, with place_id ${cover.with_pid}, their locations with place_id ${cover.loc_with_pid}`);

  const l13543 = (await client.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number::text = '13543'`, [USMCA])).rows[0];
  if (!l13543) throw new Error("load 13543 not found");
  // Idempotent by our own audit marker (lane_mileage.last_seen carries the load's date, not the run's).
  const already = (await client.query<{ n: number }>(
    `SELECT count(*)::int n FROM audit.audit_events WHERE event_class = 'dispatch.load.lane_relearned' AND payload->>'load_id' = $1`, [l13543.id])).rows[0]!.n;
  if (already > 0) console.log("LANE 13543: already relearned under 443.63 — not counted twice");
  else {
    const out = await learnLoadLanes(client as never, { operatingCompanyId: USMCA, loadId: l13543.id, fresh: true, actorUserId: OWNER });
    const o = out as Record<string, unknown>;
    await appendCrudAudit(client as never, OWNER, "dispatch.load.lane_relearned",
      { resource_type: "mdata.loads", resource_id: l13543.id, load_id: l13543.id, load_number: "13543", lane: o.lane ?? null, reason: "443.63 city corrected ALBERTIVILLE -> Albertville (AUTH-433)" }, "info", "443.63");
    console.log(`LANE 13543: ${JSON.stringify({ lane: o.lane ?? null, lane_skip_reason: o.lane_skip_reason ?? null, legs_filled: o.legs_filled })}`);
  }
  const typo = (await client.query(`SELECT origin_city, origin_state, dest_city, dest_state, n_practical, practical_miles::text FROM catalogs.lane_mileage
     WHERE operating_company_id = $1::uuid AND upper(origin_city) = 'ALBERTIVILLE'`, [USMCA])).rows;
  for (const t of typo) console.log(`TYPO LANE kept (listed): ${JSON.stringify(t)}`);

  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
