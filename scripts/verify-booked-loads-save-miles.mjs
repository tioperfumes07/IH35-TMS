#!/usr/bin/env node
/**
 * verify-booked-loads-save-miles — ROUND 443.35 (owner 2026-10-11 00:25 CT; Lead order), CC-2.
 *
 * Every booked load, any source (live_feed and historical_backfill), saves its miles for the next estimate.
 *   RULE 1 (static) — createLoadWithFullSideEffects calls learnLoadLanes (load-lane-learning.service.ts) after its stop
 *                     INSERT, and the module writes leg_miles, catalogs.lane_mileage, catalogs.point_mileage and
 *                     mdata.customer_lanes.
 *   RULE 2 (live, read-only) — a USMCA load booked since 2026-10-11 (not voided/cancelled) with a stop after the first
 *                     lacking leg_miles FAILS.
 *   RULE 3 (live, read-only) — such a load whose lane (first pickup city/state -> last delivery city/state, or the ZIP
 *                     pair) has no catalogs.lane_mileage row touched at/after the load was booked FAILS.
 * --selftest exercises every rule.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the booked loads and their lanes live in the database — fails closed without one";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-booked-loads-save-miles";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SINCE = "2026-10-11T00:00:00Z";

export function staticFailures(bookSrc, moduleSrc) {
  const out = [];
  const insertAt = bookSrc.indexOf("INSERT INTO mdata.load_stops");
  const callAt = bookSrc.indexOf("await learnLoadLanes(client");
  if (callAt < 0) out.push("RULE 1 book-load.service.ts never calls learnLoadLanes — a booked load saves no miles");
  else if (insertAt < 0 || callAt < insertAt) out.push("RULE 1 learnLoadLanes must run after the stop INSERT in createLoadWithFullSideEffects");
  if (!/import \{ learnLoadLanes \} from "\.\/load-lane-learning\.service\.js"/.test(bookSrc)) out.push("RULE 1 book-load.service.ts does not import learnLoadLanes");
  for (const t of ["UPDATE mdata.load_stops SET leg_miles", "catalogs.lane_mileage", "INSERT INTO catalogs.point_mileage", "INSERT INTO mdata.customer_lanes"])
    if (!moduleSrc.includes(t)) out.push(`RULE 1 load-lane-learning.service.ts no longer writes ${t}`);
  return out;
}

export function liveFailures(rows) {
  const out = [];
  for (const r of rows) {
    if (Number(r.non_first_stops_without_leg) > 0)
      out.push(`RULE 2 load ${r.load_number}: ${r.non_first_stops_without_leg} stop(s) after the first lack leg_miles`);
    if (!r.lane_touched) out.push(`RULE 3 load ${r.load_number}: lane ${r.lane} has no lane_mileage row touched since it was booked`);
  }
  return out;
}

const LIVE_SQL = `
  WITH l AS (
    SELECT l.id, l.load_number, l.created_at
      FROM mdata.loads l
     WHERE l.operating_company_id = $1::uuid AND l.created_at >= $2::timestamptz
       AND l.status::text NOT IN ('cancelled', 'canceled', 'void', 'voided')
       AND l.voided_at IS NULL
  ), s AS (
    SELECT st.load_id,
           count(*) FILTER (WHERE st.sequence_number > (SELECT min(x.sequence_number) FROM mdata.load_stops x
                                                        WHERE x.load_id = st.load_id AND x.soft_deleted_at IS NULL)
                              AND st.leg_miles IS NULL) AS non_first_stops_without_leg,
           (array_agg(st.city ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_city,
           (array_agg(st.state ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_state,
           (array_agg(st.postal_code ORDER BY st.sequence_number) FILTER (WHERE st.stop_type::text = 'pickup'))[1] AS o_zip,
           (array_agg(st.city ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_city,
           (array_agg(st.state ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_state,
           (array_agg(st.postal_code ORDER BY st.sequence_number DESC) FILTER (WHERE st.stop_type::text = 'delivery'))[1] AS d_zip
      FROM mdata.load_stops st
     WHERE st.load_id IN (SELECT id FROM l) AND st.soft_deleted_at IS NULL
     GROUP BY st.load_id
  )
  SELECT l.load_number, s.non_first_stops_without_leg,
         concat_ws(' -> ', s.o_city || ', ' || s.o_state, s.d_city || ', ' || s.d_state) AS lane,
         EXISTS (
           SELECT 1 FROM catalogs.lane_mileage lm
            WHERE lm.operating_company_id = $1::uuid AND lm.updated_at >= l.created_at
              AND ((lm.origin_postal_code = s.o_zip AND lm.dest_postal_code = s.d_zip)
                   OR (lm.origin_postal_code IS NULL AND lm.dest_postal_code IS NULL
                       AND lower(lm.origin_city) = lower(s.o_city) AND lower(lm.origin_state) = lower(s.o_state)
                       AND lower(lm.dest_city) = lower(s.d_city) AND lower(lm.dest_state) = lower(s.d_state)))
         ) AS lane_touched
    FROM l JOIN s ON s.load_id = l.id
   ORDER BY l.load_number`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const book = 'import { learnLoadLanes } from "./load-lane-learning.service.js";\n INSERT INTO mdata.load_stops (...)\n await learnLoadLanes(client, {';
    const mod = "UPDATE mdata.load_stops SET leg_miles catalogs.lane_mileage INSERT INTO catalogs.point_mileage INSERT INTO mdata.customer_lanes";
    const cases = [
      ["wired clean passes", staticFailures(book, mod).length === 0],
      ["no call fails", staticFailures(book.replace("await learnLoadLanes(client", ""), mod).some((x) => x.startsWith("RULE 1"))],
      ["call before the stop INSERT fails", staticFailures('import { learnLoadLanes } from "./load-lane-learning.service.js";\n await learnLoadLanes(client, {\n INSERT INTO mdata.load_stops', mod).some((x) => x.includes("after the stop INSERT"))],
      ["module dropping customer_lanes fails", staticFailures(book, mod.replace("INSERT INTO mdata.customer_lanes", "")).some((x) => x.includes("customer_lanes"))],
      ["live clean passes", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: true, lane: "A -> B" }]).length === 0],
      ["a stop without leg_miles fails", liveFailures([{ load_number: "1", non_first_stops_without_leg: 1, lane_touched: true, lane: "A -> B" }]).some((x) => x.startsWith("RULE 2"))],
      ["an untouched lane fails", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: false, lane: "A -> B" }]).some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }

  const failures = staticFailures(
    readFileSync(resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts"), "utf8"),
    readFileSync(resolve(ROOT, "apps/backend/src/dispatch/load-lane-learning.service.ts"), "utf8")
  );
  requireLiveDbOrExit(LABEL, REQUIRES_LIVE_DB);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  // A server-side disconnect after the read (pooler / compute suspend) must not crash a finished verdict.
  client.on("error", () => {});
  await client.connect();
  let rows = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    rows = (await client.query(LIVE_SQL, [USMCA, SINCE])).rows;
    await client.query("ROLLBACK");
  } finally {
    await Promise.race([client.end(), new Promise((r) => setTimeout(r, 2000))]);
  }
  failures.push(...liveFailures(rows));
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} finding(s) over ${rows.length} USMCA load(s) booked since ${SINCE}`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — booking calls learnLoadLanes after its stop INSERT; ${rows.length} USMCA load(s) booked since ${SINCE}: every stop after the first has leg_miles and every lane was touched`);
  // Exit explicitly: a pooled connection can keep the event loop alive after end() and stall the gate.
  process.exit(0);
}
