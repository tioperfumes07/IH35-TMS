#!/usr/bin/env node
/**
 * ORDERS-2026-10-01 — PM due shows source (odometer/days); unit profile Faults reverse to E-40 board.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-maint-pm-due-source-faults";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  pm: "apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx",
  unitFaults: "apps/frontend/src/components/fleet/UnitFaultsReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const pm = read(FILES.pm);
  if (!/by odometer/.test(pm) || !/by days/.test(pm)) f.push(`${FILES.pm}: due source labels required`);
  if (!/due_reasons/.test(pm)) f.push(`${FILES.pm}: must read due_reasons`);
  if (!/pm-due-source-/.test(pm)) f.push(`${FILES.pm}: pm-due-source testid required`);
  const uf = read(FILES.unitFaults);
  if (!/fault-code-alerts/.test(uf)) f.push(`${FILES.unitFaults}: must deep-link E-40 board`);
  if (!/vp-section-unit-faults/.test(uf)) f.push(`${FILES.unitFaults}: section testid required`);
  const profile = read(FILES.profile);
  if (!/UnitFaultsReverseSection/.test(profile)) f.push(`${FILES.profile}: must mount UnitFaultsReverseSection`);
  return f;
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL}${SELFTEST ? " SELFTEST" : ""} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}${SELFTEST ? " SELFTEST" : ""} PASS`);
process.exit(0);
