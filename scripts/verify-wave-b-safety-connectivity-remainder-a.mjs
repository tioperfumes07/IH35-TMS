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
    name: "Photo comparison list failure retry",
    file: "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx",
    pattern: /query\.isError[\s\S]{0,300}Couldn't load photo comparison sessions[\s\S]{0,220}query\.refetch\(\)[\s\S]{0,120}: \([\s\S]{0,120}<ParityTable/,
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
  const live = Object.fromEntries(
    [...new Set(CHECKS.map((check) => check.file))].map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")]),
  );
  const baseline = checkAll((rel) => live[rel]);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL baseline:\n${baseline.join("\n")}`);
    process.exit(1);
  }
  const photo = "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx";
  const mutated = { ...live, [photo]: live[photo].replace("query.refetch()", "query.remove()") };
  if (mutated[photo] === live[photo] || !checkAll((rel) => mutated[rel]).some((failure) => failure.includes("Photo comparison list failure retry"))) {
    console.error(`${LABEL} --selftest FAIL — planted photo-list retry defect escaped`);
    process.exit(1);
  }
  const poisoned = checkAll(() => "POISON");
  if (poisoned.length !== CHECKS.length) {
    console.error(`${LABEL} --selftest FAIL — structural poison tripped ${poisoned.length}/${CHECKS.length}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (photo retry mutation + ${CHECKS.length}/${CHECKS.length} structural checks)`);
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
