#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["unit","customer","connectivity","reverse_link"],"leaves":["geofence_alerts.list"],"task":"SAFETY-F6872-GEOFENCE-BREACH-SILENT-1000-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["unit","connectivity","reverse_link"],"leaves":["home.overview","home.kanban","home.list"],"task":"SAFETY-F6872-GEOFENCE-BREACH-SILENT-1000-CAP","vertical":"class-sweep"} */
import fs from "node:fs";

const paths = {
  route: "apps/backend/src/safety/geofence-breach.routes.ts",
  api: "apps/frontend/src/api/safetyGeofence.ts",
  safety: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["route", /page_size: z\.coerce\.number\(\).*max\(300\).*default\(50\)/, "bounded page schema"],
  ["route", /COUNT\(\*\) FILTER[\s\S]*AS total_count/, "exact filtered total"],
  ["route", /COUNT\(\*\) FILTER \(WHERE acknowledged_at IS NULL\)::int AS active_count/, "exact active total"],
  ["route", /array_agg\(DISTINCT vehicle_id::text\).*active_vehicle_ids/, "complete active unit set"],
  ["route", /LIMIT \$4::int OFFSET \$5::int/, "server range"],
  ["api", /page_size\?: number;[\s\S]*offset\?: number;/, "typed range request"],
  ["api", /total_count: number; active_count: number; active_vehicle_ids: string\[\]/, "typed exact metadata"],
  ["safety", /data-testid="geofence-breaches-server-pager"/, "Safety register pager"],
  ["safety", /page \* pageSize \+ 1.*of \{totalCount\}/, "honest range label"],
  ["dispatch", /active_vehicle_ids \?\? \[\]/, "Dispatch consumes complete active set"],
];

function failures(files) {
  return checks.filter(([key, pattern]) => !pattern.test(files[key])).map(([, , label]) => label);
}
const failed = failures(source);
if (failed.length) {
  console.error(`FAIL verify-safety-geofence-breach-range-vertical: ${failed.join(", ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...source, [key]: source[key].replace(pattern, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-safety-geofence-breach-range-vertical --selftest (${checks.length}/${checks.length} mutations killed)`);
} else {
  console.log(`PASS verify-safety-geofence-breach-range-vertical (${checks.length}/${checks.length} checks)`);
}
