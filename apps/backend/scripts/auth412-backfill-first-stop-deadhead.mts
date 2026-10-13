/**
 * AUTH-412 (Lead 443.41 G(2): "first-stop deadhead = miles from the same unit's previous load's last stop, from the mileage
 * engine, source 'computed'; NULL only when no previous load") — every USMCA load booked since 2026-10-11 whose first stop
 * still has leg_miles NULL gets it through THE SAME module the booking calls (learnLoadLanes -> computeFirstStopDeadhead:
 * point_mileage cache / routing provider, else the owner-ruled chain-deadhead haversine). Only NULL legs are filled; every
 * fill writes its audit row (dispatch.load_stop.leg_miles_computed, source 'computed'). fresh:false — lanes are not
 * re-counted (a deadhead fill does not count as a leg fill).
 *
 * MODES: --branch=<neon branch id> REQUIRED. DRY by default (rolled back). --apply COMMITS; on the production branch it also
 *   needs OWNER_AUTH_ID=AUTH-412 OPEN on main (verify-owner-authorization.mjs).
 * RUN (from the repo root): DATABASE_URL=<branch> npx tsx apps/backend/scripts/auth412-backfill-first-stop-deadhead.mts --branch=br-xxx [--apply]
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { learnLoadLanes } from "../src/dispatch/load-lane-learning.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_BRANCH = "br-fancy-credit-akjnd07a";
const SINCE = "2026-10-11T00:00:00Z";
const APPLY = process.argv.includes("--apply");
const BRANCH = (process.argv.find((a) => a.startsWith("--branch=")) ?? "").slice("--branch=".length);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (the target branch) is required");
if (!BRANCH) throw new Error("--branch=<neon branch id> is required");
if (APPLY && BRANCH === PROD_BRANCH) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-412") throw new Error(`production --apply needs OWNER_AUTH_ID=AUTH-412 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const counts = async () =>
  (
    await client.query<{ all_null: string; first_null: string }>(
      `SELECT count(*) FILTER (WHERE s.leg_miles IS NULL)::text AS all_null,
              count(*) FILTER (WHERE s.leg_miles IS NULL AND s.sequence_number =
                (SELECT min(x.sequence_number) FROM mdata.load_stops x WHERE x.load_id = s.load_id AND x.soft_deleted_at IS NULL))::text AS first_null
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND s.soft_deleted_at IS NULL
          AND l.voided_at IS NULL AND l.status::text NOT IN ('cancelled','canceled','void','voided')`,
      [USMCA, SINCE]
    )
  ).rows[0]!;

try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,true)`, [USMCA]);
  const before = await counts();
  console.log(`BEFORE: leg_miles NULL ${before.all_null} (first stops ${before.first_null})`);
  const loads = (
    await client.query<{ id: string; load_number: string }>(
      `SELECT l.id::text, l.load_number::text FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz AND l.voided_at IS NULL
          AND l.status::text NOT IN ('cancelled','canceled','void','voided')
          AND EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.leg_miles IS NULL)
        ORDER BY l.load_number`,
      [USMCA, SINCE]
    )
  ).rows;
  const methods: Record<string, number> = {};
  const reasons: Record<string, string[]> = {};
  for (const l of loads) {
    const r = await learnLoadLanes(client, { operatingCompanyId: USMCA, loadId: l.id, fresh: false, actorUserId: OWNER });
    const d = r.first_stop_deadhead;
    if (!d) continue;
    if (d.miles != null) methods[d.method] = (methods[d.method] ?? 0) + 1;
    else (reasons[d.reason] ??= []).push(l.load_number);
  }
  console.log(`computed by method: ${JSON.stringify(methods)}`);
  for (const [why, ls] of Object.entries(reasons)) console.log(`  left NULL — ${why}: ${ls.length} [${ls.join(", ")}]`);
  const after = await counts();
  console.log(`AFTER:  leg_miles NULL ${after.all_null} (first stops ${after.first_null})`);
  if (APPLY) {
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
