#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["driver","unit"],"leafRe":"^planner$","task":"LINK-F5171-FUEL-PLANNER-UNIT-DRIVER-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — fuel.planner ActiveTripStrip must EntityLink unit + driver using
 * canonical FKs from views.fuel_planner_active_routes (not entityLabel(..., null)).
 *
 * Run: node scripts/verify-fuel-planner-unit-driver-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-planner-unit-driver-entitylink";
const STRIP = "apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx";
const API = "apps/frontend/src/api/fuelPlanner.ts";

function audit(stripSrc, apiSrc) {
  const failures = [];
  if (!/driver_id:\s*string\s*\|\s*null/.test(apiSrc) || !/unit_id:\s*string\s*\|\s*null/.test(apiSrc)) {
    failures.push(`${API}: FuelActiveRoute must declare driver_id + unit_id`);
  }
  if (!/kind=["']unit["']/.test(stripSrc) || !/kind=["']driver["']/.test(stripSrc)) {
    failures.push(`${STRIP}: must EntityLink kind="unit" and kind="driver"`);
  }
  if (!/data-testid=["']fuel-planner-unit-link["']/.test(stripSrc)) {
    failures.push(`${STRIP}: missing data-testid=fuel-planner-unit-link`);
  }
  if (!/data-testid=["']fuel-planner-driver-link["']/.test(stripSrc)) {
    failures.push(`${STRIP}: missing data-testid=fuel-planner-driver-link`);
  }
  if (/entityLabel\(route\?\.unit_display_id,\s*null/.test(stripSrc)) {
    failures.push(`${STRIP}: unit still entityLabel(..., null) — no drill`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const strip = fs.readFileSync(path.join(ROOT, STRIP), "utf8");
  const api = fs.readFileSync(path.join(ROOT, API), "utf8");
  if (audit(strip, api).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    process.exit(1);
  }
  const broken = strip.replace(/kind=["']unit["']/, 'kind="load"');
  if (!audit(broken, api).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted unit kind regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const strip = fs.readFileSync(path.join(ROOT, STRIP), "utf8");
const api = fs.readFileSync(path.join(ROOT, API), "utf8");
const failures = audit(strip, api);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — fuel planner ActiveTripStrip unit+driver EntityLink`);
