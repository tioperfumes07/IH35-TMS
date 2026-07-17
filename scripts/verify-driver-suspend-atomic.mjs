#!/usr/bin/env node
/**
 * 0441-mod5-suspend-non-atomic — driver suspend must use one atomic backend endpoint.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  backendRoutes: path.join(ROOT, "apps/backend/src/mdata/driver-safety-events.routes.ts"),
  suspendModal: path.join(ROOT, "apps/frontend/src/components/drivers/SuspendConfirmModal.tsx"),
  mdataApi: path.join(ROOT, "apps/frontend/src/api/mdata.ts"),
  actionBarTest: path.join(ROOT, "apps/frontend/src/components/driver-profile/__tests__/ActionBar.test.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-driver-suspend-atomic] ${msg}`);
  process.exit(1);
}

function main() {
  const backendRoutes = read(paths.backendRoutes);
  const suspendModal = read(paths.suspendModal);
  const mdataApi = read(paths.mdataApi);
  const actionBarTest = read(paths.actionBarTest);
  const failures = [];

  if (!backendRoutes.includes('app.post("/api/v1/mdata/drivers/:driver_id/suspend"')) {
    failures.push("backend must expose POST /api/v1/mdata/drivers/:driver_id/suspend");
  }
  if (!backendRoutes.includes("UPDATE mdata.drivers") || !backendRoutes.includes("INSERT INTO mdata.driver_safety_events")) {
    failures.push("suspend route must update driver status and insert safety event in one handler");
  }
  if (!mdataApi.includes("export function suspendDriver")) {
    failures.push("mdata API must export suspendDriver");
  }
  if (!suspendModal.includes("suspendDriver(driverId")) {
    failures.push("SuspendConfirmModal must call suspendDriver");
  }
  if (suspendModal.includes("updateDriver(driverId") || suspendModal.includes("createSafetyEvent(driverId")) {
    failures.push("SuspendConfirmModal must not use sequential updateDriver + createSafetyEvent");
  }
  if (!actionBarTest.includes("suspendDriver")) {
    failures.push("ActionBar test must cover atomic suspendDriver call");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-driver-suspend-atomic] OK");
}

main();
