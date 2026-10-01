#!/usr/bin/env node
/**
 * ORDERS 2026-10-01 DRIVER PROFILE complete — FE wires CC-3 profile tab endpoints.
 * Asserts assignment history, Samsara duplicate warning, fuel E-21/E-22 verdicts,
 * attributed safety (faults/harsh/DVIR/DOT), complaints reverse, settlements read-only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-driver-profile-orders-complete";

const PAGE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const API = "apps/frontend/src/api/driver-profile-tabs.ts";
const ASSIGN = "apps/frontend/src/components/driver-profile/DriverAssignmentHistorySection.tsx";
const SAMSARA = "apps/frontend/src/components/driver-profile/DriverSamsaraDuplicateBanner.tsx";
const FUEL = "apps/frontend/src/components/driver-profile/DriverProfileFuelVerdictsSection.tsx";
const SAFETY = "apps/frontend/src/components/driver-profile/DriverProfileSafetyAttributedSection.tsx";
const COMPLAINTS = "apps/frontend/src/components/safety/ComplaintsReverseSection.tsx";
const ROUTES = "apps/backend/src/driver-profile/driver-profile-tabs.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const page = read(PAGE);
  const api = read(API);
  const assign = read(ASSIGN);
  const samsara = read(SAMSARA);
  const fuel = read(FUEL);
  const safety = read(SAFETY);
  const complaints = read(COMPLAINTS);
  const routes = read(ROUTES);

  assertIncludes(api, "/profile/assignments", API);
  assertIncludes(api, "/profile/stops-miles", API);
  assertIncludes(api, "/profile/fuel", API);
  assertIncludes(api, "/profile/safety", API);
  assertIncludes(api, "/profile/samsara", API);

  assertIncludes(routes, "/api/v1/drivers/:driverId/profile/", ROUTES);

  assertIncludes(page, "DriverAssignmentHistorySection", PAGE);
  assertIncludes(page, "DriverSamsaraDuplicateBanner", PAGE);
  assertIncludes(page, "DriverProfileFuelVerdictsSection", PAGE);
  assertIncludes(page, "DriverProfileSafetyAttributedSection", PAGE);
  assertIncludes(page, "ComplaintsReverseSection", PAGE);
  assertIncludes(page, 'filter={{ driver_id: id }}', PAGE);
  assertIncludes(page, 'data-dp-settlements-readonly="1"', PAGE);
  assertIncludes(page, "Settlements and bills on this profile are read only", PAGE);
  if (/onAutoPayChange=\{async/.test(page)) {
    throw new Error(`${PAGE}: settlements must stay read-only (no onAutoPayChange write)`);
  }

  assertIncludes(assign, 'data-dp-assignments="1"', ASSIGN);
  assertIncludes(assign, "getDriverProfileAssignments", ASSIGN);
  assertIncludes(samsara, 'data-dp-samsara="1"', SAMSARA);
  assertIncludes(samsara, "duplicate_warning", SAMSARA);
  assertIncludes(samsara, "Duplicate Samsara record warning", SAMSARA);
  // §7 palette — warning banner must use slate tokens (never amber/emerald/yellow status paint).
  assertIncludes(samsara, "border-slate-200", SAMSARA);
  assertIncludes(samsara, "bg-slate-100", SAMSARA);
  assertIncludes(samsara, "text-slate-700", SAMSARA);
  if (/amber-|emerald-|yellow-|bg-green-|text-green-/.test(samsara)) {
    throw new Error(`${SAMSARA}: off-palette §7 status class (use slate tokens only)`);
  }
  assertIncludes(fuel, 'data-dp-fuel-verdicts="1"', FUEL);
  assertIncludes(fuel, "E-21", FUEL);
  assertIncludes(fuel, "E-22", FUEL);
  assertIncludes(fuel, "getDriverProfileFuel", FUEL);
  assertIncludes(safety, 'data-dp-safety-attributed="1"', SAFETY);
  assertIncludes(safety, "getDriverProfileSafety", SAFETY);
  assertIncludes(safety, "dp-safety-faults", SAFETY);
  assertIncludes(safety, "dp-safety-harsh", SAFETY);
  assertIncludes(safety, "dp-safety-dvirs", SAFETY);
  assertIncludes(safety, "dp-safety-dot-dwell", SAFETY);

  assertIncludes(complaints, "{ driver_id: string }", COMPLAINTS);

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
