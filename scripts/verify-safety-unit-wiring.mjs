#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["unit"],"leafRe":"^(idvr\\.list|dot_inspections\\.list|safety_events\\.list|accidents\\.(list|create)|damage_reports\\.(list|create)|photo_comparison\\.list|external_fines\\.create|geofence_alerts\\.list|permits\\.list|position_history\\.list)$","task":"LINK-F5167-SAFETY-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 12 genuine safety leaves, each
 * confirmed live — real unit_id/EntityLink kind="unit" or a real EntityPicker kind="unit", sourced
 * from mdata.units.
 *
 * Self-test: node scripts/verify-safety-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/safety/IdvrPage.tsx", /kind="unit" id=\{row\.unit_id as string \| undefined\}/],
  ["apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", /id=\{row\.unit_id as string \| undefined\}/],
  ["apps/frontend/src/pages/safety/SafetyEventsPage.tsx", /kind="unit"/],
  ["apps/frontend/src/pages/safety/AccidentsPage.tsx", /kind="unit" id=\{row\.unit_id as string \| undefined\}/],
  ["apps/frontend/src/components/safety/AccidentReportDrawer.tsx", /kind="unit"/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /kind="unit"/],
  ["apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx", /kind="unit" id=\{session\.unit_uuid\}/],
  ["apps/frontend/src/pages/safety/components/FineCreateModal.tsx", /kind="unit"/],
  ["apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx", /kind="unit" id=\{event\.vehicle_id\}/],
  ["apps/frontend/src/pages/safety/Permits.tsx", /kind="unit" id=\{u\.unit_id\}/],
  ["apps/frontend/src/pages/safety/PositionHistoryPage.tsx", /searchParams\.get\("unit_id"\)/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit_id/EntityLink kind="unit" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety's 12 unit-scoped inspection/incident/permit leaves are real`);
