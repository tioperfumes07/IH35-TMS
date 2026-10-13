#!/usr/bin/env tsx
/**
 * Lead 443.62 #6 (AUTH-433): "fix the 2 workbook-typo stop cities (Laedo->Laredo, ALBERTIVILLE->Albertville) via the
 * stop-edit route and re-resolve; finish 13545 Calavo + 13599 Manfredi".
 *  1. The two typo cities are corrected the way PATCH /api/v1/mdata/loads/:id/stops/:stopId writes a stop (same UPDATE,
 *     same "mdata.load_stops.updated" audit with the change set).
 *  2. The two locations that carry a "Facility — street" label (imported from Samsara addresses the 443.49 runs pushed with
 *     the label as formattedAddress) are re-imported through ensureSamsaraAddressLocation, whose parser now keeps only the
 *     street (#26381).
 *  3. The route's re-resolve + relearn needs Google, which lives on the server: one dispatch.relearn_load_miles
 *     (record_sources) per affected load (13506, 13543, 13545, 13599) under key ...:443.62.
 * No money, no DELETE.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-62-stop-fixes.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-433 npx tsx scripts/ops/2026-10-11-cc2-443-62-stop-fixes.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { ensureSamsaraAddressLocation } from "../../apps/backend/src/integrations/samsara/geofences/address-import.service.js";
import { enqueueOutboxEvent } from "../../apps/backend/src/outbox/enqueue-outbox-event.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-62-stop-fixes.ts";
const CITY_FIXES = [
  { load: "13506", from: "Laedo", to: "Laredo" },
  { load: "13543", from: "ALBERTIVILLE", to: "Albertville" },
];
const LABEL_LOCATIONS = ["dde190cf-9877-4b51-a563-1c535af91a8b", "a75b5792-f366-4967-979b-294c57c7ae1d"]; // Calavo, Manfredi
const LOADS = ["13506", "13543", "13545", "13599"];
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-433)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-433") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-433 (got ${JSON.stringify(auth || null)})`);
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
  for (const f of CITY_FIXES) {
    const rows = (await client.query<{ id: string; load_id: string; city: string }>(
      `UPDATE mdata.load_stops s SET city = $3, updated_at = now()
         FROM mdata.loads l
        WHERE l.id = s.load_id AND l.operating_company_id = $1::uuid AND l.load_number::text = $2 AND s.city = $4 AND s.soft_deleted_at IS NULL
        RETURNING s.id::text, s.load_id::text, s.city`, [USMCA, f.load, f.to, f.from])).rows;
    for (const r of rows) {
      await appendCrudAudit(client as never, OWNER, "mdata.load_stops.updated",
        { resource_id: r.id, resource_type: "mdata.load_stops", load_id: r.load_id, changes: { city: { from: f.from, to: f.to } }, reason: "443.62 #6 workbook typo" }, "info", "BT-3-LOADS-SCHEMA");
      console.log(`CITY ${f.load} stop ${r.id}: ${f.from} -> ${f.to}`);
    }
    if (!rows.length) console.log(`CITY ${f.load}: no stop with city ${f.from} (already fixed?)`);
  }
  for (const loc of LABEL_LOCATIONS) {
    const mirrors = (await client.query(
      `SELECT DISTINCT m.samsara_address_id, m.name, m.formatted_address, m.lat, m.lng, m.geofence_json, m.raw_json
         FROM geo.geofences g JOIN integrations.samsara_addresses m ON m.samsara_address_id = g.samsara_address_id AND m.operating_company_id = g.operating_company_id
        WHERE g.operating_company_id = $1::uuid AND g.location_ref_id = $2::uuid AND m.deactivated_at IS NULL`, [USMCA, loc])).rows;
    for (const m of mirrors) {
      const locationId = await ensureSamsaraAddressLocation(client as never, USMCA, m as never);
      const after = (await client.query<{ address_line1: string }>(`SELECT address_line1 FROM mdata.locations WHERE id = $1::uuid`, [locationId])).rows[0];
      console.log(`LOCATION ${loc} <- Samsara ${m.samsara_address_id}: location ${locationId} street "${after?.address_line1}"`);
    }
    if (!mirrors.length) console.log(`LOCATION ${loc}: no Samsara mirror row linked`);
  }
  // 4. (443.62 follow-up) the resolver's existing-location step reuses the location's point but never rewrites the stop's own
  //    street text: a stop whose address_line1 is the "Facility — street" label takes its location's clean street (audited).
  const labelled = (await client.query<{ id: string; load_id: string; old: string; street: string }>(
    `UPDATE mdata.load_stops s SET address_line1 = lo.address_line1, updated_at = now()
       FROM mdata.locations lo, mdata.loads l
      WHERE lo.id = s.location_id AND l.id = s.load_id AND l.operating_company_id = $1::uuid AND s.soft_deleted_at IS NULL
        AND s.address_line1 ~ ' [—–-] \\d' AND lo.address_line1 ~ '^\\s*\\d+[A-Za-z]?\\s+\\S' AND lo.address_line1 !~ ' [—–-] '
        AND lo.id = ANY($2::uuid[])
      RETURNING s.id::text, s.load_id::text, (SELECT x.address_line1 FROM mdata.load_stops x WHERE x.id = s.id) AS old, lo.address_line1 AS street`,
    [USMCA, LABEL_LOCATIONS])).rows;
  for (const r of labelled) {
    await appendCrudAudit(client as never, OWNER, "mdata.load_stops.updated",
      { resource_id: r.id, resource_type: "mdata.load_stops", load_id: r.load_id, changes: { address_line1: { to: r.street } }, reason: "443.62 #6 street from its location (label removed)" }, "info", "BT-3-LOADS-SCHEMA");
    console.log(`STREET stop ${r.id}: -> "${r.street}"`);
  }
  if (!labelled.length) console.log("STREET: no labelled stop left");
  for (const n of LOADS) {
    const id = (await client.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number::text = $2`, [USMCA, n])).rows[0]?.id;
    if (!id) throw new Error(`load ${n} not found`);
    const r = await enqueueOutboxEvent(client as never, "dispatch.relearn_load_miles", { aggregate_type: "mdata.loads", aggregate_id: id },
      { operating_company_id: USMCA, load_id: id, actor_user_id: OWNER, record_sources: true }, `dispatch.relearn_load_miles:${id}:443.62`);
    console.log(`RELEARN ${n}: ${r.enqueued ? "enqueued" : "already queued"}`);
  }
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
