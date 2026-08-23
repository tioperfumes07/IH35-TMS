#!/usr/bin/env node
/**
 * Audit gap #16 (UI-only): Driver Profile map, load, and assign-truck surfaces.
 *
 * Map and load actions must target routes whose destination consumes the focus query.
 * Assign Truck must open AssignTruckModal via ?assign_truck=1 (ActionBar + DriverProfilePage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-dead-actions";

const FILES = {
  actionBar: "apps/frontend/src/components/driver-profile/ActionBar.tsx",
  assignModal: "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx",
  profilePage: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  assignment: "apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx",
  mapView: "apps/frontend/src/pages/dispatch/MapView.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  mdataApi: "apps/frontend/src/api/mdata.ts",
  loadsSection: "apps/frontend/src/components/driver-profile/LoadsSection.tsx",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
};

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const actionBar = stripComments(sources.actionBar);
  const assignModal = stripComments(sources.assignModal);
  const profilePage = stripComments(sources.profilePage);
  const assignment = stripComments(sources.assignment);
  const mapView = stripComments(sources.mapView);
  const dispatch = stripComments(sources.dispatch);
  const manifest = stripComments(sources.manifest);
  const mdataApi = stripComments(sources.mdataApi);
  const loadsSection = stripComments(sources.loadsSection);
  const entityLink = stripComments(sources.entityLink);

  if (/assign_truck=1/.test(actionBar) && !/onAssignTruck/.test(actionBar)) {
    errors.push(`${FILES.actionBar}: raw ?assign_truck=1 href without onAssignTruck handler`);
  }
  if (!/onAssignTruck/.test(actionBar) || !/data-testid="dp-action-assign-truck"/.test(actionBar)) {
    errors.push(`${FILES.actionBar}: Assign Truck must wire onAssignTruck on dp-action-assign-truck`);
  }
  if (!/searchParams\.get\("assign_truck"\)/.test(profilePage) || !/AssignTruckModal/.test(profilePage)) {
    errors.push(`${FILES.profilePage}: must consume assign_truck query and render AssignTruckModal`);
  }
  if (!/setDriverDefaultTruck/.test(assignModal) || !/default-truck/.test(mdataApi)) {
    errors.push(`${FILES.assignModal}: must call setDriverDefaultTruck backed by POST /default-truck`);
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

  // C5 (2026-07-25) TIGHTENED, NOT WEAKENED. This required the literal
  // `to={`/dispatch?load_id=${encodeURIComponent(String(load.load_id))}`}` and its selftest listed
  // the CANONICAL `/dispatch/loads/:id` shape as the "legacy" bad fixture — the guard had the two
  // exactly backwards and would have failed the migration. The intent — "the driver's current load
  // must be a live drill-through that actually opens the load" — is unchanged and is enforced
  // harder: the shared primitive, plus an explicit ban on the superseded form, plus the reader
  // must now honour the PATH param (without which the canonical link opens an empty board).
  if (!/<EntityLink[\s\S]{0,120}?kind=["']load["'][\s\S]{0,200}?load\.load_id/.test(assignment)) {
    errors.push(
      `${FILES.assignment}: current load must drill through <EntityLink kind="load" id={String(load.load_id)} …>`,
    );
  }
  if (/to=\{`\/dispatch\?[^`]*\bload_id=/.test(assignment)) {
    errors.push(`${FILES.assignment}: must not use the ?load_id= board bookmark — canonical is /dispatch/loads/:id`);
  }
  if (!/searchParams\.get\("load_id"\)/.test(dispatch) || !/isOpen=\{Boolean\(loadId\)\}/.test(dispatch)) {
    errors.push(`${FILES.dispatch}: dispatch destination must consume load_id and open the load drawer`);
  }
  if (!/\brouteLoadId\b/.test(dispatch) || !/useParams/.test(dispatch)) {
    errors.push(
      `${FILES.dispatch}: dispatch destination must read the /dispatch/loads/:id PATH param (useParams → routeLoadId)`,
    );
  }

  // The preview and the destination must agree on the canonical driver filter. Dispatch reads
  // `driver_id`; `?driver=` silently opened the full, unfiltered load board.
  if (!/<EntityLink\s+kind="loads_driver_filter"\s+id=\{driverId\}/.test(loadsSection)) {
    errors.push(`${FILES.loadsSection}: Full load history must use loads_driver_filter for the current driver`);
  }
  if (!/case "loads_driver_filter":\s*return `\/dispatch\/loads\?driver_id=\$\{id\}`;/.test(entityLink)) {
    errors.push(`${FILES.entityLink}: loads_driver_filter must emit the driver_id query consumed by Dispatch`);
  }
  if (!/params\.get\("driver_id"\)/.test(dispatch)) {
    errors.push(`${FILES.dispatch}: Dispatch must consume the driver_id reverse-filter query`);
  }

  return errors;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function selftest() {
  const good = {
    actionBar: `
      <Button data-testid="dp-action-assign-truck" onClick={onAssignTruck}>Assign Truck</Button>
      <a href={\`/dispatch/map?driver=\${encodeURIComponent(driverId)}\`}>Map</a>
    `,
    assignModal: "await setDriverDefaultTruck(driverId, companyId, unitId);",
    profilePage: `
      const assignTruckOpen = searchParams.get("assign_truck") === "1";
      <AssignTruckModal open={assignTruckOpen} />
    `,
    assignment: '<EntityLink kind="load" id={String(load.load_id)} label="Load" />',
    mapView: 'const focusDriverId = searchParams.get("driver"); positions.filter((p) => p.driver_uuid === focusDriverId);',
    dispatch:
      'const { id: routeLoadId } = useParams(); const loadId = routeLoadId ?? searchParams.get("load_id"); const driverId = params.get("driver_id"); ' +
      "<Drawer isOpen={Boolean(loadId)} />;",
    manifest: '<Route path="/dispatch/map" element={<MapView />} />',
    mdataApi: "export function setDriverDefaultTruck() { return apiRequest(`/default-truck`",
    loadsSection: '<EntityLink kind="loads_driver_filter" id={driverId} label="Full load history" />',
    entityLink: 'switch (kind) { case "loads_driver_filter": return `/dispatch/loads?driver_id=${id}`; }',
  };
  const pass = assertGuard(good);
  if (pass.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture produced errors`, pass);
    process.exit(1);
  }

  const legacy = {
    ...good,
    actionBar: '<a href={`/drivers/${driverId}?assign_truck=1`}>Assign Truck</a><a href="/fleet/map">Map</a>',
    profilePage: "export function DriverProfilePage() { return null; }",
    assignModal: "export function AssignTruckModal() { return null; }",
    // C5 — the superseded query-param link is the bad fixture now. It used to be the good one,
    // and the canonical /dispatch/loads/:id shape used to sit here as "legacy".
    assignment: '<Link to={`/dispatch?load_id=${encodeURIComponent(String(load.load_id))}`}>Load</Link>',
  };
  const fail = assertGuard(legacy);
  if (!fail.some((error) => error.includes("onAssignTruck")) || !fail.some((error) => error.includes("assign_truck"))) {
    console.error(`[${LABEL}] --selftest FAIL: legacy dead actions were not rejected`, fail);
    process.exit(1);
  }
  if (!fail.some((error) => error.includes("EntityLink")) || !fail.some((error) => error.includes("board bookmark"))) {
    console.error(`[${LABEL}] --selftest FAIL: the superseded ?load_id= load link was not rejected`, fail);
    process.exit(1);
  }
  // The reader half must be provable too: drop the path param and the guard must say so.
  const noPathParam = assertGuard({ ...good, dispatch: 'const loadId = searchParams.get("load_id"); <Drawer isOpen={Boolean(loadId)} />;' });
  if (!noPathParam.some((error) => error.includes("PATH param"))) {
    console.error(`[${LABEL}] --selftest FAIL: a searchParams-only reader was not rejected`, noPathParam);
    process.exit(1);
  }


  const wrongDriverKey = assertGuard({
    ...good,
    entityLink: good.entityLink.replace("?driver_id=", "?driver="),
  });
  if (!wrongDriverKey.some((error) => error.includes("loads_driver_filter"))) {
    console.error(`[${LABEL}] --selftest FAIL: a writer using ?driver= was not rejected`, wrongDriverKey);
    process.exit(1);
  }

  const missingDriverReader = assertGuard({
    ...good,
    dispatch: good.dispatch.replace('params.get("driver_id")', 'params.get("driver")'),
  });
  if (!missingDriverReader.some((error) => error.includes("consume the driver_id"))) {
    console.error(`[${LABEL}] --selftest FAIL: a Dispatch reader using the wrong driver key was not rejected`, missingDriverReader);
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
  console.log(`[${LABEL}] OK — map/load routes consumed and Assign Truck opens default-truck modal`);
}

main();
