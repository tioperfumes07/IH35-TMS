#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["unit"],"leafRe":"^(home\\.(overview|kanban|list)|secondary\\.(book_load|assignments)|queues\\.(at_risk|detention|border|border_history|late|trip_pairing|in_transit))$","task":"LINK-F5167-DISPATCH-UNIT-QUEUES"} */
/** @matrix-built {"modules":["dispatch"],"cols":["unit"],"leafRe":"^planning\\.(timeline|driver|truck|calendar|unassigned|reserve)$","task":"LINK-F5167-DISPATCH-UNIT-PLANNERS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["unit"],"leafRe":"^(load\\.detail|load\\.drawer\\.overview|dispatch\\.drawer\\.load_detail|dispatch\\.modal\\.(load_create|book_load_modal_v4|quick_assign)|dispatch\\.panel\\.(auth_gate|deadhead_optimizer|pre_dispatch_validation)|dispatch\\.wizard\\.border_crossing_wizard_page|dispatch\\.parity\\.book_load_equipment_section)$","task":"LINK-F5167-DISPATCH-UNIT-LOAD-BOOK"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 29 genuine dispatch leaves, each
 * confirmed live — real assigned_unit_id/unit_id/EntityLink kind="unit" or a real EntityPicker
 * kind="unit"/unitUuid param, sourced from mdata.units.
 *
 * Self-test: node scripts/verify-dispatch-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", /EntityLinkOrTombstone kind="unit" id=\{load\.assigned_unit_id\} name=\{load\.unit_number\} noun="Unit"/],
  ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx", /EntityLinkOrTombstone kind="unit" id=\{load\.assigned_unit_id\} name=\{load\.assigned_unit_number\} noun="Unit"/],
  ["apps/frontend/src/components/dispatch/DispatchKanban.tsx", /kind=\{load\.assigned_unit_id \? "unit" : "load"\}/],
  ["apps/frontend/src/components/dispatch/DispatchList.tsx", /<InlineUnitPicker/],
  ["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", /kind="unit" id=\{row\.previous_unit_id\}/],
  ["apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", /kind="unit" id=\{load\.unit_id\}/],
  ["apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx", /kind="unit" id=\{event\.unit_id\}/],
  ["apps/frontend/src/components/border-crossing/WizardStep1.tsx", /kind="unit"[\s\S]{0,80}value=\{form\.unitId \|\| null\}/],
  ["apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx", /kind="unit" id=\{load\.unit_id\}/],
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", /kind="unit" id=\{u\.unit_id\}/],
  ["apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx", /EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/],
  ["apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx", /<EntityLinkOrTombstone kind="unit" id=\{driver\.unit_id\} name=\{driver\.unit_number\} noun="Unit"/],
  ["apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx", /EntityLinkOrTombstone kind="unit" id=\{unitId\} name=\{unit\} noun="Unit"/],
  ["apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx", /EntityLinkOrTombstone kind="unit" id=\{row\.unitId\} name=\{row\.unitNumber\} noun="Unit"/],
  ["apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx", /kind="unit" id=\{driver\.unit_id \?\? null\}/],
  ["apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx", /kind="unit" id=\{row\.id\}/],
  ["apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", /kind="unit"[\s\S]{0,40}id=\{load\.assigned_unit_id\}/],
  ["apps/frontend/src/pages/dispatch/LoadCreateModal.tsx", /kind="unit" id=\{availabilityQuery\.data\.asset_id\}/],
  ["apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx", /const assignedUnitId = watch \? String\(watch\("assigned_unit_id"\)/],
  ["apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx", /unit_id: unitId \|\| undefined/],
  ["apps/frontend/src/components/dispatch/AuthGatePanel.tsx", /if \(props\.unitUuid\) params\.set\("unit_uuid", props\.unitUuid\)/],
  ["apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx", /unitUuid: string/],
  ["apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx", /unitUuid\?: string \| null/],
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
console.log(`${LABEL} PASS — dispatch's 29 unit-scoped queue/planner/load/book-load leaves are real`);
