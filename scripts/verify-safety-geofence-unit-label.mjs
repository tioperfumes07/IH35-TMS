#!/usr/bin/env node
/**
 * GUARD 2178 — Geofence breach alerts must not use UUID-slice EntityLink labels for units.
 * API already joins unit_number; UI must prefer that (or "Unit"), never vehicle_id.slice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-geofence-unit-label";
const FE = "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx";
const BE = "apps/backend/src/safety/geofence-breach.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const fe = sources?.[FE] ?? read(FE);
  if (!/EntityLink/.test(fe) || !/kind=["']unit["']/.test(fe)) {
    problems.push(`${FE}: missing EntityLink kind="unit"`);
  }
  if (/vehicle_id\.slice\(0,\s*8\)/.test(fe)) {
    problems.push(`${FE}: UUID-slice unit label forbidden — use unit_number`);
  }
  if (!/unit_number/.test(fe)) {
    problems.push(`${FE}: must use unit_number for EntityLink label`);
  }
  const be = sources?.[BE] ?? read(BE);
  if (!/u\.unit_number/.test(be) && !/unit_number/.test(be)) {
    problems.push(`${BE}: list query must select unit_number`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE), [BE]: read(BE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    ...live,
    [FE]: live[FE] + "\nlabel={event.vehicle_id.slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Geofence breaches use unit_number EntityLink labels`);
