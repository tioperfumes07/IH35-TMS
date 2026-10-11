#!/usr/bin/env tsx
/**
 * Lead 443.41 / owner 443.38 (AUTH-413): retire, through the same is_active=false the fence engine's PATCH uses, every ACTIVE
 * customer-site fence the post-book auto-geofence hook drew TODAY around a stop with no street (zip / city center). History kept,
 * nothing deleted. Their copies in the owner's Samsara account are NOT touched here (external write — separate ruling); the
 * samsara ids are printed so that step can be done exactly.
 *
 * Usage:
 *   DATABASE_URL=<db> npx tsx scripts/ops/2026-10-11-cc2-443-41-retire-auto-zip-fences.ts                (dry run)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-41-retire-auto-zip-fences.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-413 npx tsx scripts/ops/2026-10-11-cc2-443-41-retire-auto-zip-fences.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-413") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-413 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
// verify-ops-scripts-assert-not-production: name the target before any write (443.52 C).
if (apply) await assertIsIntendedProduction(client, { label: "2026-10-11-cc2-443-41-retire-auto-zip-fences.ts" });
else if (forkCommit) await assertNotProduction(client, { label: "2026-10-11-cc2-443-41-retire-auto-zip-fences.ts" });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const r = await client.query<{ id: string; label: string | null; samsara_address_id: string | null }>(
    `UPDATE geo.geofences SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid
      WHERE operating_company_id = $1::uuid AND is_active AND source = 'auto_dispatch' AND location_kind = 'customer_site'
        AND created_at >= '2026-10-11T00:00:00Z' AND coalesce(label,'') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'
      RETURNING id::text, label, samsara_address_id`,
    [USMCA, OWNER]
  );
  console.log(`Retired ${r.rows.length} auto-dispatch customer-site zip-center fence(s) (is_active=false; history kept).`);
  const pushed = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM outbox.events e
      WHERE e.event_type = 'samsara.create_geofence' AND e.delivered_at IS NOT NULL
        AND e.dedupe_key = ANY($1::text[])`, [r.rows.map((x) => `samsara.create_geofence:${x.id}`)]);
  console.log(`Of these, ${pushed.rows[0]!.n} were pushed to the owner's Samsara account (copies there NOT touched).`);
  for (const f of r.rows) console.log(`  ${f.id} ${f.label ?? "?"} samsara=${f.samsara_address_id ?? "-"}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
