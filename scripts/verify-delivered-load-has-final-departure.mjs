#!/usr/bin/env node
/**
 * LEAD 443.279 (10-23 4:35 PM CT) — ONE source of truth for "delivered": the final active delivery stop's departure.
 *
 * Root cause measured on prod: 13691 / 13694 / 13696 / 13697 sat at delivered_pending_docs while their final delivery
 * stop had an arrival and NO actual_departure_at. The fence detector delivered the load on the final delivery ARRIVAL,
 * then load-stop-geofence-sync retired the stop fence (the load had left dispatch work) before the truck drove out, so
 * the exit was never seen. Driver pay stayed on basis 'projected', revenue never earned, Cash Flow bucketed them on
 * projected dates.
 *
 * STATIC (every push, no credential):
 *   S1  the detector never walks a load to delivered_pending_docs from an ARRIVAL ("entered") — only from the final
 *       delivery's EXIT ("exited"), after that stop's departure is stamped;
 *   S2  the transition engine refuses a fence-evidenced delivery whose final stop has no departure;
 *   S3  the stop-geofence sync cron completes delivered* loads' missing final departures from the stored fence-exit
 *       fix through the stop engine (stampStopDeparture with an evidence time, source eld_geofence).
 * LIVE (DATABASE_URL / gate read-only credential): no USMCA, non-sample, non-void load at delivered* whose final active
 *   delivery stop has no actual_departure_at.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "mixed guard: the static arm (S1–S3, the engine rules) always runs with no credential and fails closed; only the live row " +
  "arm needs the gate's read-only credential and says LIVE NOT RUN without it";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-delivered-load-has-final-departure";
const FILES = {
  detector: "apps/backend/src/telematics/geofence-detector.service.ts",
  transition: "apps/backend/src/dispatch/load-transition.service.ts",
  cron: "apps/backend/src/cron/load-stop-geofence-sync.cron.ts",
  history: "apps/backend/src/telematics/fence-departure-from-history.service.ts",
};
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function staticFailures(src) {
  const f = [];
  const d = src.detector;
  const enteredStart = d.indexOf('if (transition === "entered" && stamped?.stop_id) {');
  const exitedDelivery = d.indexOf('if (transition === "exited" && stamped?.load_id && stamped.stop_type === "delivery") {');
  if (enteredStart < 0) f.push("S1: detector arrival block not found");
  else {
    const enteredBody = d.slice(enteredStart, exitedDelivery > enteredStart ? exitedDelivery : enteredStart + 4000);
    if (/"delivered_pending_docs"/.test(enteredBody)) f.push("S1: the detector delivers the load on an ARRIVAL (entered) — status ahead of the stop");
  }
  if (exitedDelivery < 0) f.push("S1: the detector no longer delivers on the final delivery EXIT");
  else {
    const exitBody = d.slice(exitedDelivery, exitedDelivery + 2000);
    if (!/ls2\.actual_departure_at IS NULL/.test(exitBody) || !/"delivered_pending_docs"/.test(exitBody)) {
      f.push("S1: the exit block must deliver only when no active delivery stop lacks a departure");
    }
  }
  const t = src.transition;
  if (!/input\.departure_evidence === "fence" && loadStatusRequiresDeliveryDepartureStamp\(mdataStatus\)/.test(t) || !/final_stop_not_departed/.test(t)) {
    f.push("S2: the transition engine does not refuse a fence delivery whose final stop has no departure");
  }
  if (!/completeDeliveredFinalDepartures\(\)/.test(src.cron)) f.push("S3: the stop-geofence sync cron does not complete missing final departures");
  if (!/stampStopDeparture\(client as never, stop, \{[\s\S]{0,200}source: "eld_geofence"[\s\S]{0,120}at: exit\.captured_at/.test(src.history)) {
    f.push("S3: the history repair does not write through the stop engine with the fence-exit evidence time");
  }
  if (!/if \(!pointInPolygon\(/.test(src.history)) f.push("S3: the history repair does not take the first fix OUTSIDE the stop fence");
  return f;
}

export function liveFailures(rows) {
  return rows.map((r) => `load ${r.load_number} is ${r.status} but its final delivery stop has no departure (arrived ${r.arrived_at ?? "never"})`);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => {
    if (!src[key].includes(from)) return null;
    return staticFailures({ ...src, [key]: src[key].replace(from, to) }).length > 0;
  };
  const cases = [
    ["clean sources pass", staticFailures(src).length === 0],
    ["delivering on ARRIVAL fails", plant("detector", "// LEAD 443.279 — an ARRIVAL never delivers the load.", 'await walkLoadStatusFromFence(client, input.operating_company_id, stamped.load_id, "delivered_pending_docs", input.occurred_at); // LEAD 443.279 — an ARRIVAL never delivers the load.')],
    ["dropping the exit delivery fails", plant("detector", 'if (transition === "exited" && stamped?.load_id && stamped.stop_type === "delivery") {', 'if (false) {')],
    ["exit delivery ignoring other undeparted drops fails", plant("detector", "AND ls2.actual_departure_at IS NULL", "AND true")],
    ["transition accepting a fence delivery with no departure fails", plant("transition", 'return { error: "final_stop_not_departed" as const, from: currentStatus, to: targetStatus }', "void 0")],
    ["cron without the history repair fails", plant("cron", "const departures = await completeDeliveredFinalDepartures();", "const departures: never[] = [];")],
    ["repair stamping now() instead of the evidence fails", plant("history", "at: exit.captured_at,", "at: null,")],
    ["repair taking the first fix INSIDE the fence fails", plant("history", "if (!pointInPolygon(", "if (pointInPolygon(")],
    ["a live delivered load with no final departure FAILS", liveFailures([{ load_number: "PLANT", status: "delivered_pending_docs", arrived_at: "2026-10-23" }]).length === 1],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = staticFailures(src);
if (process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT l.load_number, l.status::text AS status, f.actual_arrival_at::text AS arrived_at
         FROM mdata.loads l
         JOIN LATERAL (
           SELECT s.actual_arrival_at, s.actual_departure_at FROM mdata.load_stops s
            WHERE s.load_id = l.id AND s.stop_type::text = 'delivery' AND s.soft_deleted_at IS NULL
              AND COALESCE(s.status::text, '') <> 'cancelled'
            ORDER BY s.sequence_number DESC LIMIT 1
         ) f ON true
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
          AND COALESCE(l.is_sample_data, false) = false
          AND l.status::text IN ('delivered_pending_docs', 'completed_docs_received')
          AND f.actual_departure_at IS NULL
        ORDER BY l.load_number`,
      [USMCA]
    );
    failures.push(...liveFailures(res.rows));
    await client.query("ROLLBACK");
  } finally {
    client.release?.();
    await pool?.end?.();
  }
} else {
  console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL) — static checks only`);
}

if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — a load is delivered only through its final stop's departure (S1–S3${process.env.DATABASE_URL ? " + live" : ""})`);
