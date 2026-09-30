#!/usr/bin/env node
/**
 * C-21 — PM / fleet odometer honesty (SHARED scripts/ops/, not CC-1 verify-*.mjs).
 * Asserts "no odometer reading since" copy + odometer_reading_at wiring.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-c21-odometer-honesty";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  helper: "apps/frontend/src/lib/odometerHonesty.ts",
  cards: "apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx",
  pmRoutes: "apps/backend/src/maint/pm.routes.ts",
  fleetDash: "apps/backend/src/maintenance/dashboard.routes.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const helper = read(FILES.helper);
  if (!/No odometer reading since/.test(helper)) f.push(`${FILES.helper}: missing honesty copy`);
  const cards = read(FILES.cards);
  if (!/formatMilesRemainingHonest/.test(cards)) f.push(`${FILES.cards}: must use formatMilesRemainingHonest`);
  const pm = read(FILES.pmRoutes);
  if (!/odometer_reading_at/.test(pm) || !/captured_at/.test(pm)) {
    f.push(`${FILES.pmRoutes}: must select/return odometer_reading_at from captured_at`);
  }
  const dash = read(FILES.fleetDash);
  if (!/odometer_reading_at/.test(dash)) f.push(`${FILES.fleetDash}: fleet-table rows must expose odometer_reading_at`);
  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
process.exit(0);
