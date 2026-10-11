/**
 * AUTH-408 (Lead 443.35 item 4: "backfill the 20 through the engine") — the USMCA loads booked since 2026-10-11 before the
 * booking engine saved miles get them now through THE SAME module the booking calls (learnLoadLanes,
 * apps/backend/src/dispatch/load-lane-learning.service.ts): leg_miles where NULL, then their lane_mileage / point_mileage /
 * customer_lanes. fresh:false — a load whose legs are already filled is not counted again, so a re-run is a no-op.
 *
 * MODES: --branch=<neon branch id> REQUIRED. DRY by default (one transaction, rolled back, outcomes printed). --apply COMMITS;
 *   on the production branch it additionally needs OWNER_AUTH_ID=AUTH-408 OPEN on main (verify-owner-authorization.mjs).
 * RUN (from the repo root): DATABASE_URL=<branch> npx tsx apps/backend/scripts/auth408-backfill-load-lanes.mts --branch=br-xxx [--apply]
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { learnLoadLanes, type LaneLearningResult } from "../src/dispatch/load-lane-learning.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PROD_BRANCH = "br-fancy-credit-akjnd07a";
const SINCE = "2026-10-11T00:00:00Z";
const APPLY = process.argv.includes("--apply");
const BRANCH = (process.argv.find((a) => a.startsWith("--branch=")) ?? "").slice("--branch=".length);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (the target branch) is required");
if (!BRANCH) throw new Error("--branch=<neon branch id> is required");
if (APPLY && BRANCH === PROD_BRANCH) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-408") throw new Error(`production --apply needs OWNER_AUTH_ID=AUTH-408 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const counts = async () =>
  (
    await client.query<{ legs_null: string; first_null: string; lanes: string; points: string; customer_lanes: string }>(
      `SELECT
         (SELECT count(*) FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
           WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND s.soft_deleted_at IS NULL
             AND s.leg_miles IS NULL
             AND s.sequence_number > (SELECT min(x.sequence_number) FROM mdata.load_stops x WHERE x.load_id = s.load_id AND x.soft_deleted_at IS NULL))::text AS legs_null,
         (SELECT count(*) FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
           WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND s.soft_deleted_at IS NULL AND s.leg_miles IS NULL)::text AS first_null,
         (SELECT count(*) FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid AND updated_at >= $2::timestamptz)::text AS lanes,
         (SELECT count(*) FROM catalogs.point_mileage WHERE engine = 'load_document')::text AS points,
         (SELECT count(*) FROM mdata.customer_lanes WHERE operating_company_id = $1::uuid)::text AS customer_lanes`,
      [USMCA, SINCE]
    )
  ).rows[0]!;

await client.query("BEGIN");
await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
await client.query(`SELECT set_config('app.operating_company_id',$1,true)`, [USMCA]);
const before = await counts();
console.log(`BEFORE: stops after the first with leg_miles NULL ${before.legs_null} (all stops NULL ${before.first_null}) · lane_mileage touched since ${SINCE} ${before.lanes} · point_mileage load_document ${before.points} · customer_lanes ${before.customer_lanes}`);

const loads = (
  await client.query<{ id: string; load_number: string }>(
    `SELECT l.id::text, l.load_number::text FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND l.voided_at IS NULL
        AND EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.leg_miles IS NULL)
      ORDER BY l.load_number`,
    [USMCA, SINCE]
  )
).rows;
const results: Array<LaneLearningResult & { load_number: string }> = [];
for (const l of loads) results.push({ load_number: l.load_number, ...(await learnLoadLanes(client, { operatingCompanyId: USMCA, loadId: l.id, fresh: false })) });

const tally = (k: keyof LaneLearningResult) => results.reduce<Record<string, number>>((a, r) => ((a[String(r[k])] = (a[String(r[k])] ?? 0) + 1), a), {});
console.log(`loads ${results.length} · legs filled ${results.reduce((a, r) => a + r.legs_filled, 0)} · lane ${JSON.stringify(tally("lane"))} · point ${JSON.stringify(tally("point_mileage"))} · customer_lane ${JSON.stringify(tally("customer_lane"))}`);
for (const r of results.filter((x) => x.legs_unresolved.length || x.lane_skip_reason || x.customer_lane_skip_reason))
  console.log(`  ${r.load_number}: legs unresolved [${r.legs_unresolved.join(",")}] ${r.lane_skip_reason ?? ""} ${r.customer_lane_skip_reason ? `customer_lane: ${r.customer_lane_skip_reason}` : ""}`);
const after = await counts();
console.log(`AFTER:  stops after the first with leg_miles NULL ${after.legs_null} (all stops NULL ${after.first_null}) · lane_mileage touched since ${SINCE} ${after.lanes} · point_mileage load_document ${after.points} · customer_lanes ${after.customer_lanes}`);
if (APPLY) {
  await client.query("COMMIT");
  console.log("COMMITTED.");
} else {
  await client.query("ROLLBACK");
  console.log("DRY RUN — rolled back.");
}
await client.end();
