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
const UNIFIED_FILE = path.join(ROOT, "apps/backend/src/mdata/units-unified-list.service.ts");
const TABLE_FILE = path.join(ROOT, "apps/frontend/src/components/FleetTable.tsx");
const PAGE_FILE = path.join(ROOT, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");

const REQUIRED_TESTIDS = ["fleet-oos-since", "fleet-oos-days", "fleet-oos-location"];
const REQUIRED_FLEET_ORDER = [
  "unit_number", "vin", "type", "make_model", "year",
  "status", "assigned_driver", "irp_expiration", "us_insurance_expiration", "mx_insurance_expiration",
];

export function collectProblems(stripSrc, routesSrc, unifiedSrc = "", tableSrc = "", pageSrc = "") {
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
  for (const field of ["oos_since", "days_oos", "oos_reason", "oos_location", "estimated_completion_date", "work_order_id", "work_order_display_id"]) {
    if (!new RegExp(`\\b${field}\\b`).test(unifiedSrc)) problems.push(`unified fleet rows must carry ${field}`);
  }
  for (const key of ["oos_reason", "oos_since", "days_oos", "estimated_completion_date", "work_order_id"]) {
    if (!new RegExp(`key:\\s*["']${key}["']`).test(tableSrc)) problems.push(`main Fleet registry must expose ${key}`);
  }
  for (const field of ["assigned_driver_id", "assigned_driver_name", "irp_expiration", "us_insurance_expiration", "mx_insurance_expiration"]) {
    if (!new RegExp(`\\b${field}\\b`).test(unifiedSrc)) problems.push(`unified fleet rows must carry ${field}`);
  }
  const orderedKeys = [...tableSrc.matchAll(/key:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const requiredOrder = REQUIRED_FLEET_ORDER.map((key) => orderedKeys.indexOf(key));
  if (requiredOrder.some((index) => index < 0) || requiredOrder.some((index, position) => position > 0 && index <= requiredOrder[position - 1])) {
    problems.push(`main Fleet registry order must be identity, status, assignment, compliance dates`);
  }
  if (!/tone=["']in-shop["']/.test(pageSrc) || !/tone=["']oos["']/.test(pageSrc)) {
    problems.push("In-Shop and OOS KPI controls must use distinct visual tones");
  }
  if (!/kind=["']work_order["']/.test(tableSrc)) {
    problems.push("main Fleet registry must drill its OOS work order to the canonical work-order route");
  }
  if (!/columnOrder/.test(tableSrc) || !/setColumnOrder/.test(tableSrc)) {
    problems.push("main Fleet registry must persist its operator column order");
  }
  if (!/dragHandleProps/.test(tableSrc) || !/draggable/.test(tableSrc)) {
    problems.push("main Fleet registry headers must expose drag reorder controls");
  }
  if (!/orderedVisibleColumns\.map/.test(tableSrc) || !/renderFleetCell/.test(tableSrc)) {
    problems.push("main Fleet registry header and body must render the same ordered columns");
  }
  return problems;
}

function check() {
  const stripSrc = fs.readFileSync(STRIP_FILE, "utf8");
  const routesSrc = fs.readFileSync(ROUTES_FILE, "utf8");
  const problems = collectProblems(stripSrc, routesSrc, fs.readFileSync(UNIFIED_FILE, "utf8"), fs.readFileSync(TABLE_FILE, "utf8"), fs.readFileSync(PAGE_FILE, "utf8"));
  if (problems.length) throw new Error(`${LABEL}: ${problems.join("; ")}`);
}

function selftest() {
  const goodStrip = `data-testid="fleet-oos-since" data-testid="fleet-oos-days" data-testid="fleet-oos-location"`;
  const goodRoutes = `SELECT id, unit_number, vin, status, oos_since, oos_location FROM mdata.units WHERE 1=1`;
  const goodUnified = `oos_since days_oos oos_reason oos_location estimated_completion_date work_order_id work_order_display_id assigned_driver_id assigned_driver_name irp_expiration us_insurance_expiration mx_insurance_expiration`;
  const goodTable = `key: "unit_number" key: "vin" key: "type" key: "make_model" key: "year" key: "status" key: "assigned_driver" key: "irp_expiration" key: "us_insurance_expiration" key: "mx_insurance_expiration" key: "oos_reason" key: "oos_since" key: "days_oos" key: "estimated_completion_date" key: "work_order_id" kind="work_order" columnOrder setColumnOrder dragHandleProps draggable orderedVisibleColumns.map renderFleetCell`;
  const goodPage = `tone="in-shop" tone="oos"`;
  if (collectProblems(goodStrip, goodRoutes, goodUnified, goodTable, goodPage).length) {
    throw new Error("selftest good fixture must pass");
  }

  const mutations = [
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-since"', ""), goodRoutes), "fleet-oos-since"],
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-days"', ""), goodRoutes), "fleet-oos-days"],
    [() => collectProblems(goodStrip.replace('data-testid="fleet-oos-location"', ""), goodRoutes), "fleet-oos-location"],
    [() => collectProblems(goodStrip, goodRoutes.replace("oos_since, ", "")), "oos_since"],
    [() => collectProblems(goodStrip, goodRoutes.replace("oos_location", "")), "oos_location"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified.replace("oos_reason", ""), goodTable, goodPage), "oos_reason"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified.replace("days_oos", ""), goodTable, goodPage), "days_oos"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "oos_since"', ""), goodPage), "oos_since"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "days_oos"', ""), goodPage), "days_oos"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "oos_reason"', ""), goodPage), "oos_reason"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified.replace("estimated_completion_date", ""), goodTable, goodPage), "estimated_completion_date"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified.replace("work_order_display_id", ""), goodTable, goodPage), "work_order_display_id"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "estimated_completion_date"', ""), goodPage), "estimated_completion_date"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('kind="work_order"', ""), goodPage), "canonical work-order route"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable, goodPage.replace('tone="oos"', "")), "distinct visual tones"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace("setColumnOrder", ""), goodPage), "persist its operator column order"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace("dragHandleProps", ""), goodPage), "drag reorder controls"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace("renderFleetCell", ""), goodPage), "same ordered columns"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified.replace("assigned_driver_name", ""), goodTable, goodPage), "assigned_driver_name"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "assigned_driver" ', ""), goodPage), "identity, status, assignment, compliance dates"],
    [() => collectProblems(goodStrip, goodRoutes, goodUnified, goodTable.replace('key: "irp_expiration" key: "us_insurance_expiration"', 'key: "us_insurance_expiration" key: "irp_expiration"'), goodPage), "identity, status, assignment, compliance dates"],
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
