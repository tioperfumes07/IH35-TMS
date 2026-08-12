#!/usr/bin/env node
/**
 * WAVE-B safety connectivity remainder A — escrow/HOS-violations/photo/position/leave/scheduler/permits.
 *
 * @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^(hos_violations\\.list$|escrow_record\\.list$|photo_comparison\\.list$|position_history\\.list$|leave_(requests|balances)\\.list$|driver_scheduler\\.list$|permits\\.list$)","task":"WAVE-B-safety-connectivity-remainder-a","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-safety-connectivity-remainder-a.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-safety-connectivity-remainder-a";

const CHECKS = [
  {
    name: "HOS violations driver drill",
    file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Escrow record driver+liability drills",
    file: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
    pattern: /kind="driver"[\s\S]*liability|kind="liability"|linked_liability_id/,
  },
  {
    name: "Photo comparison driver/unit drills",
    file: "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Position history unit drill",
    file: "apps/frontend/src/pages/safety/PositionHistoryPage.tsx",
    pattern: /kind="unit"/,
  },
  {
    name: "Leave balances driver drill",
    file: "apps/frontend/src/pages/safety/driver-scheduler/DriverLeaveBalancesPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Scheduler inbox driver drill",
    file: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
    pattern: /kind="driver"/,
  },
  {
    name: "Permits unit drill",
    file: "apps/frontend/src/pages/safety/Permits.tsx",
    pattern: /kind="unit"/,
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
console.log(`${LABEL} PASS — safety HOS-violations/escrow/photo/position/leave/scheduler/permits connectivity ratcheted`);
