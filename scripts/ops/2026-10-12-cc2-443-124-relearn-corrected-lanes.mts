// LEAD 443.124 — 4 USMCA loads (13511, 13536, 13573, 13660) learned their BOOKED lane at booking, then the 443.74 / 443.86 /
// 443.90 GPS stop correction moved their origin / destination and the corrected route never learned its lane
// (verify-booked-loads-save-miles RULE 3). This re-learns each corrected route through the ONE engine:
// learnLoadLanes({ fresh: false, routeCorrected: true }) — no hand-typed miles; legs already set (owner / document legs) are
// never touched (the engine fills only NULL legs). lane_mileage / point_mileage / customer_lanes for the corrected route only.
//   default          DRY RUN (one transaction, rolled back)
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth AUTH-NNN   apply on production (assertIsIntendedProduction + verify-owner-authorization)
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-124-relearn-corrected-lanes.mts [--fork-commit | --apply --auth AUTH-NNN]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { learnLoadLanes } from "../../apps/backend/src/dispatch/load-lane-learning.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOADS = ["13511", "13536", "13573", "13660"];
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.124 relearn corrected lanes" });
else if (FORK) await assertNotProduction(db, { label: "443.124 relearn corrected lanes (fork)" });

// The guard's own RULE 3 predicate, per load: is the load's CURRENT lane (zip pair or city pair) touched since it was booked?
const LANE_TOUCHED_SQL = `
  WITH s AS (
    SELECT (array_agg(st.city ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_city,
           (array_agg(st.state ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_state,
           (array_agg(st.postal_code ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_zip,
           (array_agg(st.city ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_city,
           (array_agg(st.state ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_state,
           (array_agg(st.postal_code ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_zip
      FROM mdata.load_stops st WHERE st.load_id = $1::uuid AND st.soft_deleted_at IS NULL)
  SELECT EXISTS (
    SELECT 1 FROM catalogs.lane_mileage lm, s
     WHERE lm.operating_company_id = $2::uuid AND lm.updated_at >= $3::timestamptz
       AND ((lm.origin_postal_code = s.o_zip AND lm.dest_postal_code = s.d_zip)
            OR (lm.origin_postal_code IS NULL AND lm.dest_postal_code IS NULL
                AND lower(lm.origin_city) = lower(s.o_city) AND lower(lm.origin_state) = lower(s.o_state)
                AND lower(lm.dest_city) = lower(s.d_city) AND lower(lm.dest_state) = lower(s.d_state)))) AS touched`;

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const loads = (await db.query<{ id: string; load_number: string; created_at: string }>(
    `SELECT id::text, load_number::text, created_at::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[]) ORDER BY load_number`,
    [USMCA, LOADS])).rows;
  if (loads.length !== LOADS.length) throw new Error(`REFUSE: expected ${LOADS.length} loads, found ${loads.length}`);
  const legs = async () => (await db.query<{ s: string }>(
    `SELECT string_agg(id::text || ':' || coalesce(leg_miles::text, 'null'), '|' ORDER BY id) s FROM mdata.load_stops WHERE load_id = ANY($1::uuid[])`,
    [loads.map((l) => l.id)])).rows[0]!.s;
  const legsBefore = await legs();
  for (const l of loads) {
    const before = (await db.query<{ touched: boolean }>(LANE_TOUCHED_SQL, [l.id, USMCA, l.created_at])).rows[0]!.touched;
    if (before) throw new Error(`REFUSE: load ${l.load_number}'s lane is already learned — re-measure first`);
    const r = await learnLoadLanes(db, { operatingCompanyId: USMCA, loadId: l.id, fresh: false, routeCorrected: true, actorUserId: OWNER });
    const after = (await db.query<{ touched: boolean }>(LANE_TOUCHED_SQL, [l.id, USMCA, l.created_at])).rows[0]!.touched;
    console.log(`${l.load_number}  lane ${r.lane}${r.lane_skip_reason ? ` (${r.lane_skip_reason})` : ""}  point ${r.point_mileage}  customer ${r.customer_lane}  touched ${after}`);
    if (!after) throw new Error(`REFUSE: load ${l.load_number}'s corrected lane is still not learned — rolled back`);
  }
  if ((await legs()) !== legsBefore) throw new Error("REFUSE: a leg_miles value moved — legs are never touched by this repair; rolled back");
  console.log(`read-back: ${loads.length} corrected lanes learned, leg_miles identical`);
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
