#!/usr/bin/env node
/**
 * verify-zip-center-stops-resolved-by-gps — RULING 443.86 #2 (a fence on a zip center is wrong), CC-3. Static:
 *   S1 the GPS engine resolves a zip-center stop (geocode_source 'zip_center', no street) from the truck's loading dwell
 *      within ZIP_CITY_RADIUS_M of the centroid on the document date, never from another town;
 *   S2 it writes street + point + place id with source gps_dwell_*, keeps the document's facility name, and audits it;
 *   S3 the fence writer treats gps_dwell_* as authoritative (re-resolve never moves it back);
 *   S4 the Owner route runs it over every live zip-center stop with a dry run.
 * --selftest plants each failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-zip-center-stops-resolved-by-gps";
const F = {
  engine: "apps/backend/src/telematics/stop-gps-verification.service.ts",
  fence: "apps/backend/src/telematics/stops-geocode-backfill.service.ts",
  routes: "apps/backend/src/telematics/stops-geocode-backfill.routes.ts",
};
export function staticFailures(src) {
  const f = [];
  if (!/metersBetween\(st\.lat!, st\.lng!, d\.lat, d\.lng\) <= ZIP_CITY_RADIUS_M/.test(src.engine)) f.push(`S1 ${F.engine}: a zip-center stop is not limited to a dwell in its own city`);
  if (!/WHERE id = \$1::uuid AND geocode_source = 'zip_center'`/.test(src.engine) || /SET facility_name[^`]*geocode_source = 'zip_center'/.test(src.engine)) f.push(`S2 ${F.engine}: the zip-center write is not guarded or overwrites the document's facility name`);
  if (!/"dispatch\.load_stop\.zip_center_resolved_by_gps"/.test(src.engine)) f.push(`S2 ${F.engine}: the zip-center resolution is not audited`);
  if (!/startsWith\("gps_dwell"\)/.test(src.fence)) f.push(`S3 ${F.fence}: the fence writer may move a GPS-resolved stop back`);
  if (!/"\/api\/v1\/telematics\/stops\/zip-center-resolve"/.test(src.routes) || !/zipCenterOnly: true/.test(src.routes)) f.push(`S4 ${F.routes}: no Owner route resolves the zip-center stops`);
  return f;
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, readFileSync(join(ROOT, p), "utf8")]));
  if (process.argv.includes("--selftest")) {
    const plant = (k, from, to) => ({ ...src, [k]: src[k].split(from).join(to) });
    const cases = [
      ["the real sources pass", staticFailures(src).length === 0],
      ["any-town dwell fails S1", staticFailures(plant("engine", "<= ZIP_CITY_RADIUS_M", "<= Infinity")).some((x) => x.startsWith("S1"))],
      ["unguarded write fails S2", staticFailures(plant("engine", "WHERE id = $1::uuid AND geocode_source = 'zip_center'`", "WHERE id = $1::uuid`")).some((x) => x.startsWith("S2"))],
      ["unaudited fails S2", staticFailures(plant("engine", '"dispatch.load_stop.zip_center_resolved_by_gps"', '"x"')).some((x) => x.startsWith("S2"))],
      ["fence moves it back fails S3", staticFailures(plant("fence", 'startsWith("gps_dwell")', 'startsWith("never")')).some((x) => x.startsWith("S3"))],
      ["no route fails S4", staticFailures(plant("routes", "zipCenterOnly: true", "zipCenterOnly: false")).some((x) => x.startsWith("S4"))],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = staticFailures(src);
  if (sf.length) { console.error(`${LABEL}: FAIL\n  ${sf.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK`);
}
