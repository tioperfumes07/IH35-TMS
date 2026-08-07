#!/usr/bin/env node
/**
 * Book Load edit honesty — Block 7 mapper already round-trips commodity/weight/reefer/trip_type.
 * The edit-mode banner must NOT claim those fields "aren't stored" (false honesty / theater).
 * Hazmat remains owner-excluded from edit PATCH (create-path only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-edit-freight-roundtrip";
const SELFTEST = process.argv.includes("--selftest");

const MAPPER = "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const mapper = read(MAPPER);
  const modal = read(MODAL);

  for (const needle of [
    '["commodity", "commodity"',
    '["weight_lbs", "cargo_weight_lbs"',
    '["reefer_setpoint", "reefer_setpoint_temp_f"',
    '["trip_type", "trip_type"',
    "commodity: str(load.commodity)",
    "weight_lbs: num(load.cargo_weight_lbs)",
  ]) {
    if (!mapper.includes(needle)) problems.push(`${MAPPER}: missing ${needle}`);
  }

  // Theater ban: must not claim commodity/weight aren't stored for edit.
  if (/aren.?t stored for edit yet/i.test(modal) && /Commodity,\s*weight/i.test(modal)) {
    problems.push(
      `${MODAL}: stale honesty banner still claims Commodity/weight aren't stored — Block 7 mapper round-trips them`
    );
  }
  if (!/book-load-edit-honesty/.test(modal)) {
    problems.push(`${MODAL}: missing data-testid=book-load-edit-honesty`);
  }
  if (!/round-trip on edit/i.test(modal)) {
    problems.push(`${MODAL}: edit honesty must state commodity/weight/trip/reefer round-trip`);
  }

  return problems;
}

if (SELFTEST) {
  const plantedModal =
    'Commodity, weight, trailer/trip type, hazmat and reefer settings aren\'t stored for edit yet';
  const plantedProblems = [];
  if (/aren.?t stored for edit yet/i.test(plantedModal) && /Commodity,\s*weight/i.test(plantedModal)) {
    plantedProblems.push("caught");
  }
  if (!plantedProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted stale banner not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted stale banner caught`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — edit mapper round-trips freight fields; honesty banner not theater`);
