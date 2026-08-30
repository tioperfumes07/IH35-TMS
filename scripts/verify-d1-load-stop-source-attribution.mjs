#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  migration: "db/migrations/202613280900_load_stops_actual_arrival_departure_source.sql",
  driver: "apps/backend/src/driver/loads.routes.ts",
  prompts: "apps/backend/src/driver/arrival-prompts.routes.ts",
  pwa: "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts",
  manual: "apps/backend/src/dispatch/stamp-final-delivery-departure.ts",
  mdata: "apps/backend/src/mdata/loads.routes.ts",
  geofence: "apps/backend/src/telematics/geofence-detector.service.ts",
  timeline: "apps/backend/src/dispatch/load-geofence-timeline.routes.ts",
};

const readTree = () => Object.fromEntries(
  Object.entries(files).map(([key, rel]) => [key, fs.readFileSync(path.join(root, rel), "utf8")])
);

function failures(tree) {
  const checks = [
    ["migration arrival source", tree.migration.includes("actual_arrival_source text")],
    ["migration departure source", tree.migration.includes("actual_departure_source text")],
    ["migration allowed vocabulary", tree.migration.includes("'driver_app', 'eld_geofence', 'manual'")],
    ["migration no historical backfill", !/UPDATE\s+mdata\.load_stops/i.test(tree.migration.replaceAll(/^--.*$/gm, ""))],
    ["driver API arrival source", /actual_arrival_at = now\(\),\s*actual_arrival_source = 'driver_app'/s.test(tree.driver)],
    ["driver API departure source", /actual_departure_at = now\(\),\s*actual_departure_source = 'driver_app'/s.test(tree.driver)],
    ["arrival prompt source", /actual_arrival_source = CASE\s+WHEN actual_arrival_at IS NULL THEN 'driver_app'\s+ELSE actual_arrival_source\s+END,\s+actual_arrival_at = COALESCE/s.test(tree.prompts)],
    ["PWA arrival source", /actual_arrival_at = now\(\),\s*actual_arrival_source = 'driver_app'/s.test(tree.pwa)],
    ["PWA departure source", /actual_departure_at = now\(\),\s*actual_departure_source = 'driver_app'/s.test(tree.pwa)],
    ["office delivery source", tree.manual.includes("actual_departure_source = 'manual'")],
    ["manual stop PATCH source", tree.mdata.includes('add("actual_arrival_source", b.actual_arrival_at ? "manual" : null)') && tree.mdata.includes('add("actual_departure_source", b.actual_departure_at ? "manual" : null)')],
    ["manual stop create source", tree.mdata.includes("CASE WHEN $11::timestamptz IS NULL THEN NULL ELSE 'manual' END") && tree.mdata.includes("CASE WHEN $12::timestamptz IS NULL THEN NULL ELSE 'manual' END")],
    ["geofence source CAS", tree.geofence.includes('const source = input.source === "manual" ? "manual" : "eld_geofence"') && tree.geofence.includes("ls.actual_arrival_at IS NULL") && tree.geofence.includes("ls.actual_departure_at IS NULL")],
    ["geofence bound to selected company unit", tree.geofence.includes("l.operating_company_id = $2::uuid") && tree.geofence.includes("l.assigned_unit_id = $3::uuid")],
    ["timeline reads persisted source", tree.timeline.includes("ls.actual_arrival_source") && tree.timeline.includes("ls.actual_departure_source") && tree.timeline.includes('raw === "samsara_gps" || raw === "eld_geofence"')],
    ["UUID-safe timeline parser preserved", tree.timeline.includes("SUBSTRING(g.label FROM '-stop-([0-9]+)$')")],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const tree = readTree();
const normal = failures(tree);
if (normal.length) {
  console.error(`verify-d1-load-stop-source-attribution FAIL: ${normal.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drop migration source", "migration", "actual_arrival_source text", "arrival_source_missing text"],
    ["invent historical backfill", "migration", "COMMIT;", "UPDATE mdata.load_stops SET actual_arrival_source = 'manual';\nCOMMIT;"],
    ["drop driver departure attribution", "driver", "actual_departure_source = 'driver_app'", "actual_departure_source = NULL"],
    ["drop prompt first-observation gate", "prompts", "WHEN actual_arrival_at IS NULL THEN 'driver_app'", "WHEN TRUE THEN 'driver_app'"],
    ["drop PWA arrival attribution", "pwa", "actual_arrival_source = 'driver_app'", "actual_arrival_source = NULL"],
    ["drop office attribution", "manual", "actual_departure_source = 'manual'", "actual_departure_source = NULL"],
    ["drop manual PATCH attribution", "mdata", 'add("actual_arrival_source", b.actual_arrival_at ? "manual" : null)', 'add("actual_arrival_source", null)'],
    ["drop geofence CAS", "geofence", "ls.actual_departure_at IS NULL", "TRUE"],
    ["drop geofence company scope", "geofence", "l.operating_company_id = $2::uuid", "TRUE"],
    ["drop timeline provenance", "timeline", "ls.actual_departure_source", "NULL AS actual_departure_source"],
    ["restore UUID-unsafe parser", "timeline", "SUBSTRING(g.label FROM '-stop-([0-9]+)$')", "REGEXP_REPLACE(g.label, '^load-[^-]+-stop-', '')"],
  ];
  for (const [name, key, from, to] of mutations) {
    if (!tree[key].includes(from)) throw new Error(`selftest fixture missing: ${name}`);
    const planted = { ...tree, [key]: tree[key].replaceAll(from, to) };
    if (failures(planted).length === 0) throw new Error(`selftest survived: ${name}`);
  }
  console.log(`verify-d1-load-stop-source-attribution --selftest PASS ${mutations.length}/${mutations.length}`);
}

console.log("verify-d1-load-stop-source-attribution PASS — D-1 sources are persisted across driver, geofence, and manual writers without historical backfill");
