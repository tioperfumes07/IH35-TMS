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
 *   RULE 4 (live, read-only) — Lead 443.41 G(2): such a load whose FIRST stop lacks leg_miles while its unit has a previous
 *                     load (last stop arriving strictly before this first stop) FAILS — the deadhead is computed, NULL only
 *                     when there is no previous load.
 *   RULE 5 (static) — learnLoadLanes computes the first-stop deadhead (computeFirstStopDeadhead).
 *   RULE 6 (static, Lead 443.43 #3) — relearnLoadStopLegs is exported, protects owner legs (isModuleOwnedLeg) and never
 *            touches lane_mileage / customer_lanes.
 *   RULE 7 (static, Lead 443.124) — a route corrected after booking learns the corrected lane: stop-gps-verification.service.ts
 *            (443.74 / 443.86 / 443.90) compares the load's origin / destination before and after it moves stops and, when they
 *            changed, calls learnLoadLanes with routeCorrected: true (the engine's only bypass of "already_learned"). Prod: 13511,
 *            13536, 13573, 13660 were moved by the GPS correction and their corrected lanes were never learned (RULE 3 red).
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
  if (!/fillFirstStopDeadhead\(client, args/.test(moduleSrc) || !/export async function computeFirstStopDeadhead/.test(moduleSrc))
    out.push("RULE 5 load-lane-learning.service.ts no longer computes the first-stop deadhead from the unit's previous load");
  if (!/import \{ learnLoadLanes \} from "\.\/load-lane-learning\.service\.js"/.test(bookSrc)) out.push("RULE 1 book-load.service.ts does not import learnLoadLanes");
  // RULE 6 (Lead 443.43 #3): a stop add / resequence recomputes the module's legs through relearnLoadStopLegs, which keeps
  // owner legs and never re-counts a lane.
  const relearnAt = moduleSrc.indexOf("export async function relearnLoadStopLegs(");
  if (relearnAt < 0) out.push("RULE 6 load-lane-learning.service.ts no longer exports relearnLoadStopLegs (stop add / resequence leaves stale legs)");
  else {
    const body = moduleSrc.slice(relearnAt);
    if (/catalogs\.lane_mileage|mdata\.customer_lanes/.test(body.slice(0, body.indexOf("\n}\n") > 0 ? body.indexOf("\n}\n") : body.length)))
      out.push("RULE 6 relearnLoadStopLegs touches lane_mileage / customer_lanes — a stop edit must never re-count a lane");
    if (!/isModuleOwnedLeg\(/.test(body)) out.push("RULE 6 relearnLoadStopLegs no longer protects owner / document legs (isModuleOwnedLeg)");
  }
  for (const t of ["UPDATE mdata.load_stops SET leg_miles", "catalogs.lane_mileage", "INSERT INTO catalogs.point_mileage", "INSERT INTO mdata.customer_lanes"])
    if (!moduleSrc.includes(t)) out.push(`RULE 1 load-lane-learning.service.ts no longer writes ${t}`);
  return out;
}

/** RULE 9 (LEAD 443.233) — the lane engine excludes a yard move (same origin / destination city) by name, from lane_mileage AND
 *  customer_lanes. */
export function yardMoveFailures(moduleSrc) {
  const out = [];
  if (!/else if \(yardMove\) out\.lane_skip_reason = "yard_move";/.test(moduleSrc)) out.push("RULE 9 load-lane-learning.service.ts counts a yard move (same-city lane) in lane_mileage");
  if (!/else if \(yardMove\) out\.customer_lane_skip_reason = "yard_move";/.test(moduleSrc)) out.push("RULE 9 load-lane-learning.service.ts counts a yard move in customer_lanes");
  if (!/"dispatch\.load\.lane_excluded"/.test(moduleSrc)) out.push("RULE 9 a yard-move exclusion must be audited (dispatch.load.lane_excluded)");
  return out;
}

/** RULE 8 (LEAD 443.230, CC-3) — a booking whose deadhead could not be filled (its stops are geocoded only after commit)
 *  queues THE re-learn engine (dispatch.relearn_load_miles: resolve stops, then recomputeFirstStopDeadhead) in the same
 *  commit. Before, 13695 / 13696 / 13697 / 13699 kept a NULL first-stop leg forever (RULE 4 live). */
export function bookingRelearnFailures(bookSrc) {
  const at = bookSrc.indexOf("export async function fillDeadheadAtBooking(");
  const body = at < 0 ? "" : bookSrc.slice(at, bookSrc.indexOf("\n}\n", at) > 0 ? bookSrc.indexOf("\n}\n", at) : undefined);
  const refused = body.slice(body.indexOf("if (reason) {"));
  return /await enqueueOutboxEvent\(\s*client as never,\s*"dispatch\.relearn_load_miles",/.test(refused)
    ? []
    : ["RULE 8 book-load.service.ts fillDeadheadAtBooking: a deadhead it could not fill is never measured again — queue dispatch.relearn_load_miles"];
}

/** RULE 7 (443.124) — the GPS stop correction learns the corrected route's lane through the one engine. */
export function routeCorrectionFailures(gpsSrc, moduleSrc) {
  const out = [];
  if (!gpsSrc.includes('import { learnLoadLanes } from "../dispatch/load-lane-learning.service.js";'))
    out.push("RULE 7 stop-gps-verification.service.ts does not import learnLoadLanes — a GPS-corrected route never learns its lane");
  const movedAt = gpsSrc.indexOf("if (moved > 0) {");
  const block = movedAt < 0 ? "" : gpsSrc.slice(movedAt, movedAt + 2000);
  if (!block.includes("routeAfter !== routeBefore") || !block.includes("routeCorrected: true"))
    out.push("RULE 7 stop-gps-verification.service.ts moves stops without learning the corrected route's lane (learnLoadLanes routeCorrected)");
  if (!gpsSrc.includes("const routeBefore = await loadRouteKey(client, input.loadId);"))
    out.push("RULE 7 stop-gps-verification.service.ts does not capture the route before it moves stops");
  if (!moduleSrc.includes("if (!args.fresh && !args.routeCorrected && out.legs_filled === 0) {"))
    out.push("RULE 7 learnLoadLanes no longer lets a corrected route past already_learned");
  return out;
}

export function liveFailures(rows) {
  const out = [];
  for (const r of rows) {
    if (Number(r.non_first_stops_without_leg) > 0)
      out.push(`RULE 2 load ${r.load_number}: ${r.non_first_stops_without_leg} stop(s) after the first lack leg_miles`);
    // LEAD 443.233 (owner): a same-city move (yard move) is not a lane — the engine excludes it by name (dispatch.load.lane_excluded).
    if (!r.lane_touched && !r.yard_move) out.push(`RULE 3 load ${r.load_number}: lane ${r.lane} has no lane_mileage row touched since it was booked`);
    if (r.first_stop_missing_deadhead)
      out.push(`RULE 4 load ${r.load_number}: first stop has no leg_miles but unit's previous load ${r.prior_load_number ?? "?"} exists — compute the deadhead`);
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
  SELECT l.load_number, s.non_first_stops_without_leg, fp.prior_load_number,
         (fp.first_leg IS NULL AND fp.prior_load_number IS NOT NULL) AS first_stop_missing_deadhead,
         concat_ws(' -> ', s.o_city || ', ' || s.o_state, s.d_city || ', ' || s.d_state) AS lane,
         (lower(s.o_city) = lower(s.d_city) AND lower(s.o_state) = lower(s.d_state)) AS yard_move,
         EXISTS (
           SELECT 1 FROM catalogs.lane_mileage lm
            WHERE lm.operating_company_id = $1::uuid AND lm.updated_at >= l.created_at
              AND ((lm.origin_postal_code = s.o_zip AND lm.dest_postal_code = s.d_zip)
                   OR (lm.origin_postal_code IS NULL AND lm.dest_postal_code IS NULL
                       AND lower(lm.origin_city) = lower(s.o_city) AND lower(lm.origin_state) = lower(s.o_state)
                       AND lower(lm.dest_city) = lower(s.d_city) AND lower(lm.dest_state) = lower(s.d_state)))
         ) AS lane_touched
    FROM l JOIN s ON s.load_id = l.id
    LEFT JOIN LATERAL (
      SELECT f.leg_miles AS first_leg,
             (SELECT p.load_number::text FROM mdata.loads p
                JOIN LATERAL (SELECT COALESCE(y.actual_arrival_at, y.scheduled_arrival_at, y.appointment_start_at) AS at
                                FROM mdata.load_stops y WHERE y.load_id = p.id AND y.soft_deleted_at IS NULL
                               ORDER BY y.sequence_number DESC LIMIT 1) pl ON true
               WHERE p.assigned_unit_id = lo.assigned_unit_id AND p.operating_company_id = lo.operating_company_id AND p.id <> lo.id
                 AND p.voided_at IS NULL AND p.soft_deleted_at IS NULL AND p.status::text NOT IN ('cancelled','canceled','void','voided')
                 AND pl.at IS NOT NULL AND pl.at < COALESCE(f.actual_arrival_at, f.scheduled_arrival_at, f.appointment_start_at)
               ORDER BY pl.at DESC LIMIT 1) AS prior_load_number
        FROM mdata.loads lo
        JOIN LATERAL (SELECT z.* FROM mdata.load_stops z WHERE z.load_id = lo.id AND z.soft_deleted_at IS NULL
                       ORDER BY z.sequence_number LIMIT 1) f ON true
       WHERE lo.id = l.id AND lo.assigned_unit_id IS NOT NULL
    ) fp ON true
   ORDER BY l.load_number`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const book = 'import { learnLoadLanes } from "./load-lane-learning.service.js";\n INSERT INTO mdata.load_stops (...)\n await learnLoadLanes(client, {';
    const relearn = "\nexport async function relearnLoadStopLegs(client) {\n  if (!isModuleOwnedLeg(x)) {}\n}\n";
    const mod = "UPDATE mdata.load_stops SET leg_miles catalogs.lane_mileage INSERT INTO catalogs.point_mileage INSERT INTO mdata.customer_lanes export async function computeFirstStopDeadhead fillFirstStopDeadhead(client, args" + relearn;
    const gpsOk = 'import { learnLoadLanes } from "../dispatch/load-lane-learning.service.js";\n const routeBefore = await loadRouteKey(client, input.loadId);\n if (moved > 0) {\n if (routeAfter !== routeBefore) { await learnLoadLanes(client, { routeCorrected: true }); }';
    const modOk = "if (!args.fresh && !args.routeCorrected && out.legs_filled === 0) {";
    const cases = [
      ["wired clean passes", staticFailures(book, mod).length === 0],
      ["a module without relearnLoadStopLegs fails", staticFailures(book, mod.replace("export async function relearnLoadStopLegs(", "async function x(")).some((x) => x.startsWith("RULE 6"))],
      ["relearn without owner-leg protection fails", staticFailures(book, mod.replace("isModuleOwnedLeg(x)", "true")).some((x) => x.includes("owner"))],
      ["relearn that re-counts a lane fails", staticFailures(book, mod.replace("if (!isModuleOwnedLeg(x)) {}", "if (!isModuleOwnedLeg(x)) {} catalogs.lane_mileage")).some((x) => x.includes("re-count"))],
      ["no call fails", staticFailures(book.replace("await learnLoadLanes(client", ""), mod).some((x) => x.startsWith("RULE 1"))],
      ["call before the stop INSERT fails", staticFailures('import { learnLoadLanes } from "./load-lane-learning.service.js";\n await learnLoadLanes(client, {\n INSERT INTO mdata.load_stops', mod).some((x) => x.includes("after the stop INSERT"))],
      ["module dropping customer_lanes fails", staticFailures(book, mod.replace("INSERT INTO mdata.customer_lanes", "")).some((x) => x.includes("customer_lanes"))],
      ["live clean passes", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: true, lane: "A -> B" }]).length === 0],
      ["a stop without leg_miles fails", liveFailures([{ load_number: "1", non_first_stops_without_leg: 1, lane_touched: true, lane: "A -> B" }]).some((x) => x.startsWith("RULE 2"))],
      ["a module without the deadhead computation fails", staticFailures(book, mod.replace("fillFirstStopDeadhead(client, args", "")).some((x) => x.startsWith("RULE 5"))],
      ["a first stop missing its computable deadhead fails", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: true, lane: "A -> B", first_stop_missing_deadhead: true, prior_load_number: "0" }]).some((x) => x.startsWith("RULE 4"))],
      ["a first stop with no previous load passes", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: true, lane: "A -> B", first_stop_missing_deadhead: false, prior_load_number: null }]).length === 0],
      ["RULE 7 wired clean passes", routeCorrectionFailures(gpsOk, modOk).length === 0],
      ["RULE 7 a GPS correction without the lane learn fails", routeCorrectionFailures(gpsOk.replace("routeCorrected: true", ""), modOk).some((x) => x.startsWith("RULE 7"))],
      ["RULE 7 no route snapshot before the move fails", routeCorrectionFailures(gpsOk.replace("const routeBefore = await loadRouteKey(client, input.loadId);", ""), modOk).some((x) => x.startsWith("RULE 7"))],
      ["RULE 7 an engine that refuses a corrected route fails", routeCorrectionFailures(gpsOk, modOk.replace("!args.routeCorrected && ", "")).some((x) => x.startsWith("RULE 7"))],
      ["RULE 8 a refusal that queues the re-learn passes", bookingRelearnFailures('export async function fillDeadheadAtBooking(x) {\n  if (reason) {\n    await enqueueOutboxEvent(\n      client as never,\n      "dispatch.relearn_load_miles",\n  }\n}\n').length === 0],
      ["RULE 8 a silent refusal fails", bookingRelearnFailures('export async function fillDeadheadAtBooking(x) {\n  if (reason) {\n    await appendCrudAudit(client);\n  }\n}\n').some((x) => x.startsWith("RULE 8"))],
      ["RULE 9 a yard move (untouched) passes", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: false, yard_move: true, lane: "Laredo, TX -> Laredo, TX" }]).length === 0],
      ["RULE 9 engine without the yard-move exclusion fails", yardMoveFailures("x").some((x) => x.startsWith("RULE 9"))],
      ["RULE 9 engine with it passes", yardMoveFailures('else if (yardMove) out.lane_skip_reason = "yard_move";\nelse if (yardMove) out.customer_lane_skip_reason = "yard_move";\n"dispatch.load.lane_excluded"').length === 0],
      ["an untouched lane fails", liveFailures([{ load_number: "1", non_first_stops_without_leg: 0, lane_touched: false, lane: "A -> B" }]).some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }

  const failures = [
    ...bookingRelearnFailures(readFileSync(resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts"), "utf8")),
    ...yardMoveFailures(readFileSync(resolve(ROOT, "apps/backend/src/dispatch/load-lane-learning.service.ts"), "utf8")),
    ...routeCorrectionFailures(
      readFileSync(resolve(ROOT, "apps/backend/src/telematics/stop-gps-verification.service.ts"), "utf8"),
      readFileSync(resolve(ROOT, "apps/backend/src/dispatch/load-lane-learning.service.ts"), "utf8")
    ),
    ...staticFailures(
    readFileSync(resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts"), "utf8"),
    readFileSync(resolve(ROOT, "apps/backend/src/dispatch/load-lane-learning.service.ts"), "utf8")
    ),
  ];
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
