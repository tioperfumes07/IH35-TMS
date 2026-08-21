#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^(maintenance\\.panel\\.road_service_active|wo\\.source\\.rs)$","task":"MAINTENANCE-ROADSIDE-WO-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): "Primary buttons: + Create / + Book only (never + New / + Add)".
 * Two real "+ Roadside WO" create buttons (RoadServiceList.tsx, RMBucketsGrid.tsx) had NO verb at
 * all — relabeled to "+ Create Roadside WO", matching the "+ Create Work Order" convention already
 * used elsewhere on the maintenance module.
 */
import fs from "node:fs";
const LABEL = "verify-maintenance-roadside-wo-chrome-law";
const files = {
  list: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
  grid: "apps/frontend/src/pages/maintenance/components/RMBucketsGrid.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/>\s*\+\s*Create Roadside WO\s*</.test(s.list)) failures.push("RoadServiceList.tsx button must read '+ Create Roadside WO'");
  if (!/>\s*\+\s*Create Roadside WO\s*</.test(s.grid)) failures.push("RMBucketsGrid.tsx button must read '+ Create Roadside WO'");
  if (/>\s*\+\s*Roadside WO\s*</.test(s.list)) failures.push("RoadServiceList.tsx must not use the no-verb '+ Roadside WO' label");
  if (/>\s*\+\s*Roadside WO\s*</.test(s.grid)) failures.push("RMBucketsGrid.tsx must not use the no-verb '+ Roadside WO' label");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["list-revert", "list", /\+\s*Create Roadside WO/, "+ Roadside WO"],
    ["grid-revert", "grid", /\+\s*Create Roadside WO/, "+ Roadside WO"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — both real Roadside WO create buttons read "+ Create Roadside WO", no no-verb label`);
