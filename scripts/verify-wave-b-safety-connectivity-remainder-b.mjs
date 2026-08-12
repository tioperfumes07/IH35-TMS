#!/usr/bin/env node
/**
 * WAVE-B safety connectivity remainder B — damage/trailer cluster + driver files training drills.
 *
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^(damage_reports\\.|trailer_interchanges\\.list$|driver_files\\.list$)","task":"WAVE-B-safety-connectivity-remainder-b","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-safety-connectivity-remainder-b.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-safety-connectivity-remainder-b";

const CHECKS = [
  {
    name: "Damage reports use incidents cluster",
    file: "apps/frontend/src/pages/safety/DamageReportsPage.tsx",
    pattern: /incidentType:\s*"damage_report"/,
  },
  {
    name: "Trailer interchanges use incidents cluster",
    file: "apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx",
    pattern: /incidentType:\s*"trailer_interchange"/,
  },
  {
    name: "Incidents cluster list driver drill",
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    pattern: /key:\s*"driver_id"[\s\S]*kind="driver"/,
  },
  {
    name: "Incidents cluster list unit drill",
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    pattern: /kind="unit"/,
  },
  {
    name: "Driver files mounts drivers list + profile",
    file: "apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx",
    pattern: /<DriversListPage[\s\S]*onOpenProfile/,
  },
  {
    name: "Driver files training table driver drill",
    file: "apps/frontend/src/pages/safety/components/TrainingTable.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Driver files links to training records",
    file: "apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx",
    pattern: /to="\/safety\/training\/records"/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety damage/trailer cluster + driver_files connectivity ratcheted`);
