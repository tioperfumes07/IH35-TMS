#!/usr/bin/env node
/**
 * OPERATOR-SURFACES-TEST-DATA — Dispatch OOS + Maintenance WO operator lists must hide TEST/DEMO fixtures.
 *
 * ROOT CAUSE CLASS: backend list endpoints filtered is_sample_data OR voided_at alone, but non-flagged
 * TEST-% unit_number rows and open TEST-/DEMO- display_id work orders still surfaced on USMCA operator UI.
 *
 * Read-only exclusion — rows stay in prod (NO-SEAT / WORM). No DELETE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const FILES = {
  unitsRoutes: "apps/backend/src/mdata/units.routes.ts",
  woVisibility: "apps/backend/src/maintenance/work-order-visibility.ts",
  maintWoRoutes: "apps/backend/src/maintenance/work-orders.routes.ts",
  maintWoService: "apps/backend/src/maintenance/work-orders.service.ts",
  legacyWoRoutes: "apps/backend/src/work-orders/work-orders.routes.ts",
  severeRepair: "apps/backend/src/maintenance/severe-repair-estimate.service.ts",
  fleetOosStrip: "apps/frontend/src/components/dispatch/FleetOosStrip.tsx",
  operatorLib: "apps/frontend/src/lib/operator-fleet-visibility.ts",
};

function fail(msg) {
  console.error(`verify-operator-surfaces-exclude-test-data FAIL — ${msg}`);
  process.exit(1);
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label}: expected ${JSON.stringify(needle)}`);
}

function main() {
  const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));

  if (!/export function excludeDemoPhantomSql/.test(read("apps/backend/src/mdata/fleet-visibility.ts"))) {
    fail("fleet-visibility.ts must export excludeDemoPhantomSql");
  }
  if (!/export function operatorWorkOrderListSql/.test(src.woVisibility)) {
    fail("work-order-visibility.ts must export operatorWorkOrderListSql");
  }

  // DISPATCH-4 extended: non-unified /api/v1/mdata/units must match unified fleet hygiene.
  assertIncludes(src.unitsRoutes, 'excludeDemoPhantomSql("unit_number")', FILES.unitsRoutes);
  assertIncludes(src.unitsRoutes, "is_sample_data IS NOT TRUE", FILES.unitsRoutes);
  assertIncludes(src.unitsRoutes, "DISPATCH-4", FILES.unitsRoutes);

  // MAINT-3: maintenance operator WO lists share work-order-visibility.ts (DEMO-/TEST- display_id).
  for (const [key, file] of [
    ["maintWoRoutes", FILES.maintWoRoutes],
    ["maintWoService", FILES.maintWoService],
    ["legacyWoRoutes", FILES.legacyWoRoutes],
  ]) {
    assertIncludes(src[key], "operatorWorkOrderListSql", file);
    assertIncludes(src[key], "work-order-visibility.js", file);
  }

  // Severe repair estimates feed Dispatch Fleet OOS strip — exclude sample/demo units on join.
  assertIncludes(src.severeRepair, "excludeDemoPhantomSql", FILES.severeRepair);
  assertIncludes(src.severeRepair, "excludeSampleDataSql", FILES.severeRepair);

  // Frontend defense-in-depth on Dispatch OOS strip.
  assertIncludes(src.fleetOosStrip, "isOperatorVisibleUnit", FILES.fleetOosStrip);
  assertIncludes(src.operatorLib, "isOperatorVisibleWorkOrder", FILES.operatorLib);

  console.log("verify-operator-surfaces-exclude-test-data OK — Dispatch OOS + Maintenance WO operator lists exclude TEST/DEMO fixtures");
}

function selftest() {
  const goodUnits = read(FILES.unitsRoutes);
  const badUnits = goodUnits.replace('excludeDemoPhantomSql("unit_number")', "");
  const checkUnits = (unitsSrc) => {
    if (!unitsSrc.includes('excludeDemoPhantomSql("unit_number")')) {
      throw new Error("missing excludeDemoPhantomSql");
    }
  };

  try {
    checkUnits(goodUnits);
    console.log("  selftest OK — passes with excludeDemoPhantomSql present");
  } catch (e) {
    console.error("  selftest FAIL — good source rejected:", e.message);
    process.exit(1);
  }
  try {
    checkUnits(badUnits);
    console.error("  selftest FAIL — bad source should have been rejected");
    process.exit(1);
  } catch {
    console.log("  selftest OK — rejects missing excludeDemoPhantomSql");
  }
  console.log("verify-operator-surfaces-exclude-test-data SELFTEST OK — 2/2");
}

if (process.argv.includes("--selftest")) selftest();
else main();
