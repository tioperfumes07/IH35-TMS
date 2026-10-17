#!/usr/bin/env node
/**
 * LEAD 443.192 (10:35Z — "check Google Routes on prod, no route cached since 10-12"): a Google route that does not come back
 * says WHY. Measured: Render was healthy (healthz/geocode source google); the 2026-10-16 USMCA loads were booked by a process
 * with no GOOGLE_PLACES_* config, and every deadhead it left NULL / on the lane average named only "osrm_not_configured"
 * because integrations/google/routes-api-client.ts computeRouteReference returned a bare null on every failure.
 * THE RULE: computeRouteReferenceOrReason names the failure (not configured / disabled / HTTP status / no route / fetch
 * failed), logs the HTTP status (never the key), and the booking's leg-miles chooser (dispatch/load-lane-learning.service.ts
 * chooseLegMiles — first-stop deadhead, stop legs) carries that reason into its NULL / lane-average result.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  client: "apps/backend/src/integrations/google/routes-api-client.ts",
  lanes: "apps/backend/src/dispatch/load-lane-learning.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const fn = s.client.match(/export async function computeRouteReferenceOrReason\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!fn) p.push(`${F.client}: computeRouteReferenceOrReason (route or a named failure) is missing`);
  for (const r of ["google_routes_not_configured", "google_routes_disabled", "google_routes_http_", "google_routes_no_route", "google_routes_fetch_failed"])
    if (!fn.includes(`"${r}`) && !fn.includes(`\`${r}`)) p.push(`${F.client}: computeRouteReferenceOrReason must name "${r}"`);
  if (/return null;/.test(fn)) p.push(`${F.client}: computeRouteReferenceOrReason returns a bare null — every failure is named`);
  if (/console\.(warn|error|log)\([^)]*apiKey/.test(s.client)) p.push(`${F.client}: logs the API key`);
  if ((s.lanes.match(/route: RouteFn = computeRouteReferenceOrReason/g) ?? []).length < 3)
    p.push(`${F.lanes}: the leg-miles / deadhead paths must default to computeRouteReferenceOrReason`);
  const choose = s.lanes.match(/export async function chooseLegMiles\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/googleMissReason\(google\)/.test(choose)) p.push(`${F.lanes}: chooseLegMiles must carry the Google miss reason into its result`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["HTTP failure back to bare null", { client: base.client.replace(/return \{ miles: null, reason \};/, "return null;") }],
    ["missing config unnamed", { client: base.client.replace('"google_routes_not_configured" };', '"x" };') }],
    ["chooser drops the Google reason", { lanes: base.lanes.replace("googleMissReason(google)", '""') }],
    ["deadhead defaults back to the bare-null client", { lanes: base.lanes.replaceAll("route: RouteFn = computeRouteReferenceOrReason", "route: RouteFn = computeRouteReference") }],
    ["key logged", { client: base.client + "\nconsole.warn(`k ${cfg.apiKey}`);\n" }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
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
    console.error(`verify-google-route-failure-has-reason: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-google-route-failure-has-reason: OK — a Google route miss is named on the booking's deadhead / leg miles.");
}
