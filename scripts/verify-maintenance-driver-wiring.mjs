#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["driver"],"leafRe":"^(wo\\.create|wo\\.source\\.(is|es|ac|et|rt|it|rs))$","task":"LINK-F5168-MAINTENANCE-WO-DRIVER-WIRING"} */
/** @matrix-built {"modules":["maintenance"],"cols":["driver"],"leafRe":"^(in_transit\\.promote_to_wo|driver_reports\\.queue|road_service\\.active|defects\\.convert_to_wo|pre_flight_dvir\\.queue)$","task":"LINK-F5168-MAINTENANCE-QUEUES-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 13 genuine maintenance leaves.
 * wo.create + all 7 wo.source.* leaves share CreateWOSectionIdentification.tsx's real driver_id
 * field + DriverPickerWithCreate (mounted by CreateWorkOrderModal.tsx for every WO source type).
 * road_service.active's RoadServiceTicketModal.tsx has a real EntityPicker kind="driver". The
 * remaining 5 queue/table leaves each render a real driver_id + EntityLink/Link kind="driver".
 *
 * Self-test: node scripts/verify-maintenance-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx", /register\("driver_id", \{ required: requireDriverAndLoad \}\)/],
  ["apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx", /<EntityPicker\s*\n\s*kind="driver"/],
  ["apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx", /<EntityLinkOrTombstone\s+kind="driver"\s+id=\{issue\.driver_id\}\s+name=\{issue\.driver_full_name\}\s+noun="Driver"/],
  ["apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx", /kind="driver"[\s\S]{0,120}id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/maintenance/RoadServiceList.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx", /<EntityLinkOrTombstone\s+kind="driver"\s+id=\{row\.driver_id\}\s+name=\{row\.driver_name\}\s+noun="Driver"/],
  ["apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx", /kind="driver" id=\{row\.driver_id \?\? undefined\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
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
console.log(`${LABEL} PASS — maintenance's 13 driver-scoped WO/queue leaves are real`);
