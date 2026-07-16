#!/usr/bin/env node
/**
 * Audit gap #16 (UI-only): Driver Profile map, load, and assign-truck surfaces.
 *
 * Map and load actions must target routes whose destination consumes the focus query.
 * Assign Truck must not emit the ignored `?assign_truck=1` query until a real workflow exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-dead-actions";

const FILES = {
  actionBar: "apps/frontend/src/components/driver-profile/ActionBar.tsx",
  assignment: "apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx",
  mapView: "apps/frontend/src/pages/dispatch/MapView.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const actionBar = stripComments(sources.actionBar);
  const assignment = stripComments(sources.assignment);
  const mapView = stripComments(sources.mapView);
  const dispatch = stripComments(sources.dispatch);
  const manifest = stripComments(sources.manifest);

  if (/assign_truck/.test(actionBar)) {
    errors.push(`${FILES.actionBar}: ignored ?assign_truck query link returned`);
  }
  if (
    !/(?:\bdisabled\b[\s\S]{0,200}data-testid="dp-action-assign-truck"|data-testid="dp-action-assign-truck"[\s\S]{0,200}\bdisabled\b)/.test(
      actionBar
    )
  ) {
    errors.push(`${FILES.actionBar}: Assign Truck must remain visible and honestly disabled`);
  }
  if (!/title="Assign a driver from the Fleet unit profile\."/.test(actionBar)) {
    errors.push(`${FILES.actionBar}: disabled Assign Truck must explain the working assignment location`);
  }

  if (!/href=\{`\/dispatch\/map\?driver=\$\{encodeURIComponent\(driverId\)\}`\}/.test(actionBar)) {
    errors.push(`${FILES.actionBar}: map action must target encoded /dispatch/map?driver=`);
  }
  if (!/path="\/dispatch\/map"/.test(manifest)) {
    errors.push(`${FILES.manifest}: /dispatch/map route is not mounted`);
  }
  if (!/searchParams\.get\("driver"\)/.test(mapView) || !/p\.driver_uuid === focusDriverId/.test(mapView)) {
    errors.push(`${FILES.mapView}: map destination must consume and match the driver query`);
  }

  if (!/to=\{`\/dispatch\?load_id=\$\{encodeURIComponent\(String\(load\.load_id\)\)\}`\}/.test(assignment)) {
    errors.push(`${FILES.assignment}: current load must target encoded canonical /dispatch?load_id=`);
  }
  if (!/searchParams\.get\("load_id"\)/.test(dispatch) || !/isOpen=\{Boolean\(loadId\)\}/.test(dispatch)) {
    errors.push(`${FILES.dispatch}: dispatch destination must consume load_id and open the load drawer`);
  }

  return errors;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function selftest() {
  const good = {
    actionBar: `
      <Button data-testid="dp-action-assign-truck" disabled
        title="Assign a driver from the Fleet unit profile.">Assign Truck</Button>
      <a href={\`/dispatch/map?driver=\${encodeURIComponent(driverId)}\`}>Map</a>
    `,
    assignment: "<Link to={`/dispatch?load_id=${encodeURIComponent(String(load.load_id))}`}>Load</Link>",
    mapView: 'const focusDriverId = searchParams.get("driver"); positions.filter((p) => p.driver_uuid === focusDriverId);',
    dispatch: 'const loadId = searchParams.get("load_id"); <Drawer isOpen={Boolean(loadId)} />;',
    manifest: '<Route path="/dispatch/map" element={<MapView />} />',
  };
  const pass = assertGuard(good);
  if (pass.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture produced errors`, pass);
    process.exit(1);
  }

  const legacy = {
    ...good,
    actionBar: '<a href={`/drivers/${driverId}?assign_truck=1`}>Assign Truck</a><a href="/fleet/map">Map</a>',
    assignment: '<Link to={`/dispatch/loads/${load.load_id}`}>Load</Link>',
  };
  const fail = assertGuard(legacy);
  if (!fail.some((error) => error.includes("assign_truck")) || !fail.some((error) => error.includes("load_id"))) {
    console.error(`[${LABEL}] --selftest FAIL: legacy dead actions were not rejected`, fail);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertGuard(Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)])));
  if (errors.length) {
    console.error(`[${LABEL}] FAILED:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — map/load routes are consumed and Assign Truck is honestly disabled`);
}

main();
