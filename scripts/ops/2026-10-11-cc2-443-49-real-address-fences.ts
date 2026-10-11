#!/usr/bin/env tsx
/**
 * Lead 443.49 items 1 + 3 (owner 2026-10-11 05:39 CT, verbatim: "We keep them and we need the real address geo fences"; AUTH-422).
 *
 * 1. The auto-dispatch zip-center customer-site fences drawn today (AUTH-413 retired them locally). Each is mapped to the stop it
 *    was drawn for (its own samsara.create_geofence outbox payload carries stop_id). For each:
 *      - stop now on a REAL address (house-numbered street; geocoder_place / location_existing) AND the fence has a Samsara copy
 *        -> the fence is MOVED to the real point (standard radius), re-activated as that location's ONE fence (any other active
 *           non-Samsara-import fence on the location is retired — no duplicate), and ONE samsara.update_geofence is enqueued for
 *           its EXISTING Samsara address id (same id; nothing created, nothing deleted in Samsara);
 *      - stop resolved to an owner Samsara address (samsara_address*) -> the stop already uses THAT address + fence; the zip
 *        fence and any Samsara copy are left untouched (owner keeps them) and listed;
 *      - stop on a real address but the fence never reached Samsara -> the zip fence stays retired; item 3 pushes the
 *        location's one fence;
 *      - stop still without a street -> left as is, listed.
 * 3. Every Creator stop on a real address: its location has exactly ONE active fence (extra non-import fences retired) and that
 *    fence is pushed to Samsara ONCE (samsara.create_geofence, same payload shape as auto-geofence) when it has no Samsara copy
 *    and no create event yet. Owner Samsara-import fences are already in Samsara and are never pushed.
 * Nothing is deleted. Re-runnable (idempotent): moved fences, pushed fences and retired duplicates are skipped on a re-run.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-49-real-address-fences.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-422 npx tsx scripts/ops/2026-10-11-cc2-443-49-real-address-fences.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { enqueueOutboxEvent } from "../../apps/backend/src/outbox/enqueue-outbox-event.js";
import { squareVerticesFromCenter } from "../../apps/backend/src/telematics/auto-geofence.service.js";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const ENTER_RADIUS_M = 402;
const EXIT_RADIUS_M = 805;
const STREET = "^\\s*[0-9]+[A-Za-z]?\\s+\\S";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-422)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-422") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-422 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

type Fence = {
  fence_id: string; samsara_address_id: string | null; is_active: boolean; stop_id: string | null; load_id: string | null;
  load_number: string | null; street: string | null; facility: string | null; city: string | null; state: string | null;
  postal_code: string | null; geocode_source: string | null; location_id: string | null; lat: number | null; lng: number | null;
};

const client = new pg.Client({ connectionString: url });
await client.connect();
const lines: string[] = [];
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  const fences = (await client.query<Fence>(
    `SELECT g.id::text fence_id, g.samsara_address_id, g.is_active, s.id::text stop_id, s.load_id::text load_id, l.load_number,
            s.address_line1 street, s.facility_name facility, s.city, s.state, s.postal_code, s.geocode_source,
            s.location_id::text, s.latitude::float8 lat, s.longitude::float8 lng
       FROM geo.geofences g
       LEFT JOIN outbox.events e ON e.event_type = 'samsara.create_geofence' AND e.dedupe_key = 'samsara.create_geofence:' || g.id::text
       LEFT JOIN mdata.load_stops s ON s.id = (e.payload->>'stop_id')::uuid
       LEFT JOIN mdata.loads l ON l.id = s.load_id
      WHERE g.operating_company_id = $1::uuid AND g.source = 'auto_dispatch'
        -- a moved fence becomes location_kind 'custom'; it is still one of these fences (its own create event names its stop)
        AND (g.location_kind = 'customer_site' OR e.id IS NOT NULL)
        AND g.created_at >= '2026-10-11T00:00:00Z'
      ORDER BY l.load_number NULLS LAST, g.id`, [USMCA])).rows;

  let moved = 0, linkedSamsara = 0, realNoCopy = 0, noStreet = 0, alreadyMoved = 0;
  const label = (f: { facility: string | null; street: string | null; city: string | null; state: string | null; postal_code: string | null }) =>
    [f.facility, [f.street, f.city, [f.state, f.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" — ");

  for (const f of fences) {
    const real = !!f.street && new RegExp(STREET).test(f.street) && f.lat != null && f.lng != null && !!f.location_id;
    const tag = `${f.load_number ?? "?"} ${f.facility ?? ""} (${f.city ?? "?"}, ${f.state ?? "?"}) fence ${f.fence_id} samsara=${f.samsara_address_id ?? "-"}`;
    if (!real) { noStreet++; lines.push(`NO_STREET\t${tag}`); continue; }
    if ((f.geocode_source ?? "").startsWith("samsara_address")) {
      // The stop uses the owner's own Samsara address + fence. The zip copy stays in Samsara untouched (owner keeps it); locally
      // it must not stay ACTIVE at a zip center next to the real fence.
      if (f.is_active) await client.query(`UPDATE geo.geofences SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid WHERE id = $1::uuid`, [f.fence_id, OWNER]);
      linkedSamsara++; lines.push(`LINKED_TO_OWNER_SAMSARA_ADDRESS (Samsara zip copy untouched${f.is_active ? "; local copy retired" : ""})\t${tag}`); continue;
    }
    if (!f.samsara_address_id) { realNoCopy++; lines.push(`REAL_ADDRESS_NO_SAMSARA_COPY (location fence pushed in item 3)\t${tag}`); continue; }
    // Move the fence that has a Samsara copy to the real point and make it the location's one fence.
    const already = (await client.query(`SELECT 1 FROM geo.geofences WHERE id = $1::uuid AND is_active AND location_ref_id = $2::uuid`, [f.fence_id, f.location_id])).rows.length;
    if (already) {
      // Its Samsara update never delivered (e.g. failed "no handler" before the handler deployed): enqueue it once more.
      const updated = (await client.query(
        `SELECT 1 FROM outbox.events WHERE event_type = 'samsara.update_geofence' AND (payload->>'geofence_id') = $1 AND delivered_at IS NOT NULL`,
        [f.fence_id])).rows.length;
      if (!updated) {
        await enqueueOutboxEvent(client as never, "samsara.update_geofence", { aggregate_type: "geo.geofences", aggregate_id: f.fence_id }, {
          operating_company_id: USMCA, geofence_id: f.fence_id, samsara_address_id: f.samsara_address_id,
          latitude: f.lat, longitude: f.lng, label: label(f), formatted_address: label(f), actor_user_id: OWNER,
        }, `samsara.update_geofence:${f.fence_id}:443.49-retry`);
        alreadyMoved++; lines.push(`ALREADY_MOVED (Samsara update re-enqueued)\t${tag}`); continue;
      }
      alreadyMoved++; lines.push(`ALREADY_MOVED\t${tag}`); continue;
    }
    await client.query(
      `UPDATE geo.geofences g SET is_active = false, updated_at = now(), updated_by_user_uuid = $3::uuid
        WHERE g.operating_company_id = $1::uuid AND g.location_ref_id = $2::uuid AND g.is_active AND g.source <> 'samsara_import'`,
      [USMCA, f.location_id, OWNER]);
    const name = label(f);
    await client.query(
      `UPDATE geo.geofences SET location_kind = 'custom', location_ref_id = $3::uuid, label = $4, vertices_json = $5::jsonb,
              center_lat = $6, center_lng = $7, radius_m = $8, enter_radius_m = $8, exit_radius_m = $9, approach_radius_m = $9,
              is_active = true, updated_at = now(), updated_by_user_uuid = $10::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [f.fence_id, USMCA, f.location_id, name, JSON.stringify(squareVerticesFromCenter(f.lat!, f.lng!, ENTER_RADIUS_M * 2)), f.lat, f.lng, ENTER_RADIUS_M, EXIT_RADIUS_M, OWNER]);
    await enqueueOutboxEvent(client as never, "samsara.update_geofence", { aggregate_type: "geo.geofences", aggregate_id: f.fence_id }, {
      operating_company_id: USMCA, geofence_id: f.fence_id, samsara_address_id: f.samsara_address_id,
      latitude: f.lat, longitude: f.lng, label: name, formatted_address: name, actor_user_id: OWNER,
    }, `samsara.update_geofence:${f.fence_id}:443.49`);
    await appendCrudAudit(client as never, OWNER, "telematics.geofence.moved_to_real_address",
      { operating_company_id: USMCA, geofence_id: f.fence_id, samsara_address_id: f.samsara_address_id, stop_id: f.stop_id, location_id: f.location_id, latitude: f.lat, longitude: f.lng }, "info", "443.49");
    moved++; lines.push(`MOVED (Samsara copy update enqueued)\t${tag}`);
  }

  // Item 3 — one active fence per real-address location of a Creator stop, pushed to Samsara once.
  const locs = (await client.query<{ location_id: string; stop_id: string; load_id: string; lat: number; lng: number; facility: string | null; street: string | null; city: string | null; state: string | null; postal_code: string | null }>(
    `SELECT DISTINCT ON (s.location_id) s.location_id::text, s.id::text stop_id, s.load_id::text, s.latitude::float8 lat, s.longitude::float8 lng,
            s.facility_name facility, s.address_line1 street, s.city, s.state, s.postal_code
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
      WHERE l.operating_company_id = $1::uuid AND l.created_at >= '2026-10-11' AND l.status <> 'cancelled' AND s.soft_deleted_at IS NULL
        AND s.location_id IS NOT NULL AND s.latitude IS NOT NULL AND s.address_line1 ~ $2
      ORDER BY s.location_id, l.load_number, s.sequence_number`, [USMCA, STREET])).rows;
  let pushed = 0, repushed = 0, ownerImport = 0, dupRetired = 0, noFence = 0, alreadyInSamsara = 0;
  for (const L of locs) {
    const fs_ = (await client.query<{ id: string; source: string; samsara_address_id: string | null }>(
      `SELECT id::text, source, samsara_address_id FROM geo.geofences
        WHERE operating_company_id = $1::uuid AND location_ref_id = $2::uuid AND is_active
        ORDER BY (samsara_address_id IS NOT NULL) DESC, (source = 'samsara_import') DESC, created_at`, [USMCA, L.location_id])).rows;
    if (!fs_.length) { noFence++; lines.push(`LOCATION_WITH_STREET_NO_FENCE\tlocation ${L.location_id} ${L.facility ?? ""} ${L.street ?? ""}`); continue; }
    const keep = fs_[0]!;
    for (const extra of fs_.slice(1)) {
      if (extra.source === "samsara_import") continue;
      await client.query(`UPDATE geo.geofences SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid WHERE id = $1::uuid`, [extra.id, OWNER]);
      dupRetired++;
    }
    if (keep.source === "samsara_import") { ownerImport++; continue; }
    if (keep.samsara_address_id) { alreadyInSamsara++; continue; }
    const name = label(L);
    // A create already DELIVERED without a Samsara id never reached Samsara (the handler read the RLS-scoped config with no
    // company context and no-op'd as "not configured", fixed in this PR) — re-push it once under a retry key.
    const falselyDelivered = (await client.query(
      `SELECT 1 FROM outbox.events WHERE event_type = 'samsara.create_geofence' AND dedupe_key = $1 AND delivered_at IS NOT NULL`,
      [`samsara.create_geofence:${keep.id}`])).rows.length > 0;
    const r = await enqueueOutboxEvent(client as never, "samsara.create_geofence", { aggregate_type: "geo.geofences", aggregate_id: keep.id }, {
      operating_company_id: USMCA, geofence_id: keep.id, load_id: L.load_id, stop_id: L.stop_id, latitude: L.lat, longitude: L.lng,
      formatted_address: name, label: name, actor_user_id: OWNER,
    }, falselyDelivered ? `samsara.create_geofence:${keep.id}:443.49-retry` : `samsara.create_geofence:${keep.id}`);
    if (r.enqueued) { pushed++; if (falselyDelivered) repushed++; }
  }

  // 443.49 #4: no ACTIVE fence the TMS drew from a stop may sit on a zip / city center (the guard's RULE 9 predicate) — retire them
  // locally (history kept; any Samsara copy untouched).
  const zipRetired = (await client.query<{ id: string; label: string | null }>(
    `UPDATE geo.geofences g SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid
      WHERE g.operating_company_id = $1::uuid AND g.is_active AND g.source = 'auto_dispatch'
        AND ((EXISTS (SELECT 1 FROM mdata.locations lo WHERE lo.id = g.location_ref_id AND nullif(trim(lo.address_line1),'') IS NULL))
          OR (g.location_kind = 'customer_site' AND EXISTS (
                SELECT 1 FROM outbox.events e JOIN mdata.load_stops s ON s.id = (e.payload->>'stop_id')::uuid
                 WHERE e.event_type = 'samsara.create_geofence' AND e.dedupe_key = 'samsara.create_geofence:' || g.id::text
                   AND s.geocode_source IN ('zip_center','city_center'))))
      RETURNING g.id::text, g.label`, [USMCA, OWNER])).rows;
  for (const z of zipRetired) lines.push(`ZIP_CENTER_FENCE_RETIRED (local only)\tfence ${z.id} ${z.label ?? ""}`);

  console.log(`Item 1 — ${fences.length} auto zip-center fences: moved to a real address ${moved} (Samsara copy update enqueued), already moved ${alreadyMoved}, stop on an owner Samsara address ${linkedSamsara} (untouched), real address but never in Samsara ${realNoCopy}, still no street ${noStreet}.`);
  console.log(`Item 3 — ${locs.length} real-address locations of Creator stops: owner Samsara-import fence ${ownerImport}, already in Samsara ${alreadyInSamsara}, pushed now ${pushed} (re-pushed after a false "delivered" ${repushed}), duplicate fences retired ${dupRetired}, location with a street but no fence ${noFence}. Active zip-center fences retired ${zipRetired.length}.`);
  for (const l of lines) console.log(`  ${l}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
