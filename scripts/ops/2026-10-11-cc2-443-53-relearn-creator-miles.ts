#!/usr/bin/env tsx
/**
 * Lead 443.53 #2 (AUTH-428), owner 2026-10-11 09:23 CT: "Yes we can calculate we are supposed to be using estimates from google,
 * and from estimates another Claude agent created basted on averages etc for all the loads historically moved".
 * Planning leg miles + first-stop deadhead on every USMCA Creator load (created since 2026-10-11, not cancelled) are re-derived
 * by the engine ON THE SERVER (Google's key is only there): one outbox event dispatch.relearn_load_miles per load; its handler
 * runs relearnLoadStopLegs + recomputeFirstStopDeadhead through chooseLegMiles (cache -> Google -> lane average -> NULL; never
 * a straight line). This script writes ONLY outbox rows. Driver pay miles are never touched (pay = the signed settlement).
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-53-relearn-creator-miles.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-428 npx tsx scripts/ops/2026-10-11-cc2-443-53-relearn-creator-miles.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { enqueueOutboxEvent } from "../../apps/backend/src/outbox/enqueue-outbox-event.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-53-relearn-creator-miles.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-428)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-428") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-428 (got ${JSON.stringify(auth || null)})`);
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
  const loads = (await client.query<{ id: string; load_number: string }>(
    `SELECT l.id::text, l.load_number::text FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid AND l.created_at >= '2026-10-11' AND l.status <> 'cancelled' AND l.soft_deleted_at IS NULL
      ORDER BY l.load_number`, [USMCA])).rows;
  let enqueued = 0, deduped = 0;
  for (const l of loads) {
    const r = await enqueueOutboxEvent(client as never, "dispatch.relearn_load_miles", { aggregate_type: "mdata.loads", aggregate_id: l.id },
      { operating_company_id: USMCA, load_id: l.id, actor_user_id: OWNER }, `dispatch.relearn_load_miles:${l.id}:443.53`);
    if (r.enqueued) enqueued++; else deduped++;
  }
  console.log(`Creator loads ${loads.length}: relearn events enqueued ${enqueued}, already queued ${deduped}.`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
