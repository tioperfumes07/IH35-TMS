#!/usr/bin/env tsx
/**
 * Lead 443.64 3b (AUTH-436) follow-up, owner 443.49: "We keep them and we need the real address geo fences" — and 443.49 #4:
 * no ACTIVE fence the TMS drew may sit on a zip / city center.
 *  1. Measured 18:45Z: 39 active auto_dispatch fences with no Samsara copy whose place has no street — all drawn 2026-09-09..09-28
 *     (before the Creator), none linked to a Creator load. 37 are city / zip centers ("Facility — CITY, ST", "Laredo, TX") and
 *     are RETIRED on our side (is_active false, history kept, audited). The 2 whose label carries a street ("100 Warehouse Dr,
 *     Laredo", "200 Cold Storage Rd, San Antonio") are kept and listed for the owner.
 *  2. 13587 #2 Grupo MS shares the 822 Union Pacific location that AUTH-435 moved to the Google rooftop point; one
 *     dispatch.relearn_load_miles (record_sources) re-resolves its stops so the stop follows its location (server-side).
 * Nothing in Samsara is touched; no DELETE; no money.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-64-zip-fences-13587.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-436 npx tsx scripts/ops/2026-10-11-cc2-443-64-zip-fences-13587.ts --apply
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
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-64-zip-fences-13587.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-436)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-436") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-436 (got ${JSON.stringify(auth || null)})`);
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
  const candidates = `
    FROM geo.geofences g LEFT JOIN mdata.locations lo ON lo.id = g.location_ref_id
   WHERE g.operating_company_id = $1::uuid AND g.source = 'auto_dispatch' AND g.is_active AND g.samsara_address_id IS NULL
     AND (lo.address_line1 IS NULL OR lo.address_line1 !~ '^\\s*\\d')`;
  const kept = (await client.query<{ id: string; label: string }>(`SELECT g.id::text, g.label ${candidates} AND g.label ~ '^\\s*\\d' ORDER BY g.label`, [USMCA])).rows;
  const retired = (await client.query<{ id: string; label: string }>(
    `UPDATE geo.geofences x SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid
      WHERE x.id IN (SELECT g.id ${candidates.replace("$1", "$1")} AND coalesce(g.label, '') !~ '^\\s*\\d')
      RETURNING x.id::text, x.label`, [USMCA, OWNER])).rows;
  for (const r of retired) {
    await appendCrudAudit(client as never, OWNER, "telematics.geofence.retired_zip_center",
      { operating_company_id: USMCA, geofence_id: r.id, label: r.label, reason: "443.64 3b: active TMS fence on a zip / city center with no Samsara copy (443.49 #4)" }, "info", "443.64");
  }
  console.log(`ZIP FENCES retired ${retired.length}; kept (street label, listed) ${kept.length}: ${kept.map((k) => k.label).join(" | ")}`);
  const l = (await client.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number::text = '13587'`, [USMCA])).rows[0];
  if (!l) throw new Error("load 13587 not found");
  const r = await enqueueOutboxEvent(client as never, "dispatch.relearn_load_miles", { aggregate_type: "mdata.loads", aggregate_id: l.id },
    { operating_company_id: USMCA, load_id: l.id, actor_user_id: OWNER, record_sources: true }, `dispatch.relearn_load_miles:${l.id}:443.64`);
  console.log(`RELEARN 13587: ${r.enqueued ? "enqueued" : "already queued"}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
