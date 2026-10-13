#!/usr/bin/env node
/**
 * GUARD — ROUND 443.16: STOP ARRIVAL / DEPARTURE COME FROM THE TRACKING DATA (owner 2026-10-10).
 *
 * MEASURED on main: stampDeliveryStopActuals wrote <delivery date>T18:00:00Z into actual_arrival_at AND
 * actual_departure_at of the delivery stop only — an invented time; telematics.unit_stop_events holds the trucks' real
 * stops.
 *
 * STATIC
 *   1. no invented clock time (T18:00 / T14:00) anywhere in the Creator's stop stamping; stampDeliveryStopActuals gone
 *   2. stampStopsFromTracking reads telematics.unit_stop_events for the load's truck, within STOP_MATCH_RADIUS_M of the
 *      stop, on the stop's local date; nearest when several; tracked -> eld_geofence + actual_stop_event_id
 *   3. none -> date_only + manual (the document date), with the reason in the result; an existing stamp is never
 *      overwritten (WHERE actual_arrival_at IS NULL)
 *   4. no GPS row is written (no INSERT / UPDATE / DELETE on telematics.*)
 *   5. the seeder and the post both stamp through it; the post response lists stop_stamps
 *   6. migration 202615460900 adds actual_stop_event_id (FK) + actual_stamp_precision (tracked / date_only)
 * Run: node scripts/verify-settlement-creator-stop-stamps-from-tracking.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-stop-stamps-from-tracking";
const F = {
  deliver: "apps/backend/src/driver-finance/settlement-creator-deliver.ts",
  seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
  mig: "db/migrations/202615460900_load_stop_stamp_from_tracking.sql",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-stop-stamps.test.ts",
};

export function problems(src) {
  const p = [];
  const all = src.deliver + src.seed + src.svc;
  if (/T18:00:00|T14:00:00|stampDeliveryStopActuals/.test(all)) p.push("an invented stop time (T18:00 / T14:00) or the old stampDeliveryStopActuals remains");
  const d = src.deliver;
  if (!/FROM telematics\.unit_stop_events e/.test(d) || !/e\.unit_id = \$2::uuid/.test(d) || !/WHERE metres <= \$7 ORDER BY metres/.test(d)) p.push("stamps must come from the truck's stop events within the match radius, nearest first");
  if (!/AT TIME ZONE \$6\)::date <= \$5::date/.test(d)) p.push("a stop event must be on the stop's local date");
  if (!/actual_stamp_precision = 'tracked'/.test(d) || !/actual_stop_event_id = \$4::uuid/.test(d) || !/'eld_geofence'/.test(d)) p.push("a tracked stamp must link the stop event and say eld_geofence");
  if (!/actual_stamp_precision = 'date_only'/.test(d) || !/precision: "date_only"[\s\S]{0,200}note: `date only — \$\{reason\}`/.test(d)) p.push("no stop event -> date_only with its reason in the result");
  if ((d.match(/WHERE id = \$1::uuid AND actual_arrival_at IS NULL/g) ?? []).length < 2) p.push("an existing stop stamp must never be overwritten");
  if (/(INSERT INTO|UPDATE|DELETE FROM)\s+telematics\./i.test(d)) p.push("a GPS / telematics row is written");
  if (!/stampStopsFromTracking\(client, bookedId/.test(src.seed) || !/stampStopsFromTracking\(client, loadId/.test(src.svc)) p.push("the seeder and the post must stamp through stampStopsFromTracking");
  if (!/stop_stamps: stopStamps/.test(src.routes)) p.push("the post result must list stop_stamps");
  if (!/actual_stop_event_id uuid/.test(src.mig) || !/'tracked' AND actual_stop_event_id IS NOT NULL/.test(src.mig)) p.push("migration 202615460900 must add the stop-event link and the precision rule");
  if (!/nearest of 2/.test(src.test) || !/not\.toMatch\(\/T18:00\//.test(src.test)) p.push("stop-stamp unit tests missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems({ ...good, deliver: good.deliver + "\nconst at = `${d}T18:00:00.000Z`;" }).some((x) => /invented/.test(x))) bad.push("an invented T18:00 passed");
  if (!problems(m("deliver", "WHERE metres <= $7 ORDER BY metres", "ORDER BY started_at")).some((x) => /radius/.test(x))) bad.push("a radius-free match passed");
  if (!problems({ ...good, deliver: good.deliver + "\nawait client.query(`UPDATE telematics.unit_stop_events SET load_id_at_time = $1`);" }).some((x) => /GPS/.test(x))) bad.push("a GPS write passed");
  if (!problems(m("routes", "stop_stamps: stopStamps", "x: 1")).some((x) => /stop_stamps/.test(x))) bad.push("a hidden stamp result passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 5/5 (real tree passes; invented time, radius-free match, GPS write, hidden result each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — every Creator stop is stamped from the truck's tracked stop event (nearest within ${"805"} m, linked) or marked date-only with the reason; no invented time; no GPS row written.`);
