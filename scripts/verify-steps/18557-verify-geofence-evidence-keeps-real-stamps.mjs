#!/usr/bin/env node
/**
 * LEAD 443.184 G11 — fences at booking + load status from fence evidence, without losing real stamps.
 *
 * Measured on main before this step (#26764 already binds right after geocode):
 *   a. a fence ARRIVAL at the final delivery moved the load to delivered_pending_docs through the transition engine,
 *      which stamped the stop's departure = the arrival time, source 'manual' — the real fence exit (fill-null) could then
 *      never stamp, and the dwell was lost;
 *   b. replace-stops bound fences right after an insert that writes no geocode_precision and no coordinates — every new
 *      stop was skipped until the cron;
 *   c. a manual / Truck Line delivery departure delivered the load on ANY delivery stop (not only the final one);
 *   d. booking stamped a catalog location 'rooftop' even when it is city-level (no street address).
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  transition: "apps/backend/src/dispatch/load-transition.service.ts",
  detector: "apps/backend/src/telematics/geofence-detector.service.ts",
  replace: "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  stamp: "apps/backend/src/dispatch/stop-stamp.service.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  if (!/departure_evidence\?: "attested" \| "fence";/.test(s.transition) || !/if \(input\.departure_evidence !== "fence"\) await stampFinalActiveDeliveryDeparture\(/.test(s.transition))
    p.push(`${F.transition}: a fence arrival must not attest a departure (a)`);
  if (!/delivered_at: deliveredAt \?\? null, departure_evidence: "fence" as const/.test(s.detector)) p.push(`${F.detector}: the fence walk must pass departure_evidence "fence" (a)`);
  const g = s.replace.indexOf("await geocodeStopsWithClient(client, userId, operatingCompanyId, loadId);");
  const b = s.replace.indexOf("await bindLoadToGeofences(client, operatingCompanyId, loadId);");
  if (g < 0 || b < 0 || g > b) p.push(`${F.replace}: replace-stops must geocode the stops before binding fences (b)`);
  if (!/const isFinalActiveDeliveryStop = stop\.stop_type === "delivery" && finalDelivery === String\(stop\.id\);/.test(s.stamp) || !/isFinalActiveDeliveryStop \? "delivered_pending_docs" : "in_transit"/.test(s.stamp))
    p.push(`${F.stamp}: only the final active delivery may deliver the load (c)`);
  if (!/stop\.location_id && String\(stop\.address_line1 \?\? ""\)\.trim\(\)/.test(s.book) || /stop\.google_place_id\?\.trim\(\) \|\| stop\.location_id \? "rooftop"/.test(s.book))
    p.push(`${F.book}: a catalog location is rooftop only with a street address (d)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["arrival attests departure", { transition: base.transition.replace('if (input.departure_evidence !== "fence") await stampFinalActiveDeliveryDeparture(', "await stampFinalActiveDeliveryDeparture(") }],
    ["detector drops flag", { detector: base.detector.replace(', departure_evidence: "fence" as const', "") }],
    ["bind before geocode", { replace: base.replace.replace("await geocodeStopsWithClient(client, userId, operatingCompanyId, loadId);\n", "") }],
    ["any delivery delivers", { stamp: base.stamp.replace('isFinalActiveDeliveryStop ? "delivered_pending_docs" : "in_transit"', 'stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit"') }],
    ["city location rooftop", { book: base.book.replace('(stop.location_id && String(stop.address_line1 ?? "").trim())', "stop.location_id") }],
  ];
  for (const [n, src] of plants) {
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-geofence-evidence-keeps-real-stamps FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-geofence-evidence-keeps-real-stamps PASS: fence arrival keeps the real departure; replace-stops geocodes before bind; only the final delivery delivers; city locations not rooftop (G11)");
}
