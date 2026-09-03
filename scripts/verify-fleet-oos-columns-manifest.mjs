#!/usr/bin/env node
/**
 * PACKET-C (Fleet OOS/in-shop columns, 2026-09-03 all-seats broadcast) — the "Fleet OOS / In shop"
 * strip (apps/frontend/src/components/dispatch/FleetOosStrip.tsx) must show OOS-since, days-OOS, and
 * location for every out-of-service unit, and the columns must actually be FED real data by the
 * backend list endpoint they read from -- not just present in the JSX while the SELECT they depend
 * on stays blank (the exact defect the "Reason" column already had: coded, but oos_reason was never
 * selected by /api/v1/mdata/units, so it rendered "--" for every unit-sourced row).
 *
 * PASS requires BOTH halves:
 *  - FleetOosStrip.tsx exposes data-testid="fleet-oos-since" / "fleet-oos-days" / "fleet-oos-location"
 *    (element manifest law).
 *  - units.routes.ts's main list SELECT includes oos_since AND oos_location (the columns those cells
 *    read) so the frontend fields are not permanently undefined.
 *
 * Self-test: node scripts/verify-fleet-oos-columns-manifest.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-oos-columns-manifest";
const STRIP_FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/FleetOosStrip.tsx");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/mdata/units.routes.ts");

const REQUIRED_TESTIDS = ["fleet-oos-since", "fleet-oos-days", "fleet-oos-location"];

export function collectProblems(stripSrc, routesSrc) {
  const problems = [];
  for (const id of REQUIRED_TESTIDS) {
    if (!new RegExp(`data-testid=["']${id}["']`).test(stripSrc)) {
      problems.push(`FleetOosStrip.tsx must expose data-testid="${id}"`);
    }
  }
  // The SELECT that feeds listUnits() (used without include=trailers by this strip) must carry the
  // real columns the new cells read -- a testid with no matching column is theater. Anchored on
  // "unit_number, vin" (unique to the main list SELECT) so it can't match one of this file's several
  // OTHER shorter "SELECT ... FROM mdata.units" queries (count, VIN lookup, PATCH re-read, …).
  const selectBlockMatch = routesSrc.match(/SELECT[\s\S]{0,80}unit_number,\s*vin[\s\S]*?FROM mdata\.units\b/);
  const selectBlock = selectBlockMatch ? selectBlockMatch[0] : "";
  if (!/\boos_since\b/.test(selectBlock)) problems.push("units.routes.ts list SELECT must include oos_since");
  if (!/\boos_location\b/.test(selectBlock)) problems.push("units.routes.ts list SELECT must include oos_location");
  return problems;
}

function check() {
  const stripSrc = fs.readFileSync(STRIP_FILE, "utf8");
  const routesSrc = fs.readFileSync(ROUTES_FILE, "utf8");
  const problems = collectProblems(stripSrc, routesSrc);
  if (problems.length) throw new Error(`${LABEL}: ${problems.join("; ")}`);
}

function selftest() {
  const goodStrip = `data-testid="fleet-oos-since" data-testid="fleet-oos-days" data-testid="fleet-oos-location"`;
  const goodRoutes = `SELECT id, unit_number, vin, status, oos_since, oos_location FROM mdata.units WHERE 1=1`;
  if (collectProblems(goodStrip, goodRoutes).length) {
    throw new Error("selftest good fixture must pass");
  }

  const mutations = [
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-since"', ""), goodRoutes), "fleet-oos-since"],
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-days"', ""), goodRoutes), "fleet-oos-days"],
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-location"', ""), goodRoutes), "fleet-oos-location"],
    [() => collectProblems(goodStrip, goodRoutes.replace("oos_since, ", "")), "oos_since"],
    [() => collectProblems(goodStrip, goodRoutes.replace("oos_location", "")), "oos_location"],
  ];
  for (const [run, expected] of mutations) {
    const problems = run();
    if (!problems.some((problem) => problem.includes(expected))) {
      throw new Error(`selftest mutation escaped: removing ${expected} did not fail (${JSON.stringify(problems)})`);
    }
  }
  console.log(`${LABEL}: OK — selftest PASS ${mutations.length}/${mutations.length}`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
