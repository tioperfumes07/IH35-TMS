#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^(home\\.(overview|kanban|list|round_trips)|secondary\\.(book_load|assignments|pre_settlements))$","task":"LINK-F5168-DISPATCH-DRIVER-HOME-SECONDARY"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^queues\\.(at_risk|detention|border|border_history|late|trip_pairing|in_transit)$","task":"LINK-F5168-DISPATCH-DRIVER-QUEUES"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^planning\\.(timeline|driver|truck|calendar|unassigned|reserve)$","task":"LINK-F5168-DISPATCH-DRIVER-PLANNERS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^(docs\\.(pod|equipment_transfers)|misc\\.(trip_profit|layover))$","task":"LINK-F5168-DISPATCH-DRIVER-DOCS-MISC"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^load\\.(detail|drawer\\.(overview|settlement))$","task":"LINK-F5168-DISPATCH-DRIVER-LOAD"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver"],"leafRe":"^dispatch\\.(modal\\.(load_reassign|book_load_modal_v4|quick_assign|equipment_transfer)|drawer\\.load_detail|panel\\.optimal_drivers|wizard\\.border_crossing_wizard_page|parity\\.(assign_driver_dropdown|book_load_equipment_section))$","task":"LINK-F5168-DISPATCH-DRIVER-MODALS-PANELS"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 36 genuine dispatch leaves, each
 * confirmed live — a real driver_id/assigned_primary_driver_id + EntityLink kind="driver", a real
 * InlineDriverPicker/DriverPickerWithCreate/EntityPicker kind="driver", or (AssignDriverDropdown/
 * OptimalDriversPanel) a real driver roster query keyed on driver_id.
 *
 * Self-test: node scripts/verify-dispatch-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-driver-wiring";

const CHECKS = [
  ["apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts", /NULLIF\(trim\(concat_ws\(' ', d\.first_name, d\.last_name\)\), ''\) AS driver_name/],
  ["apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts", /d\.id = e\.driver_uuid AND d\.operating_company_id = e\.operating_company_id/],
  ["apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts", /l\.load_number/],
  ["apps/backend/src/integrations/samsara/border-crossings/customs-time.service.ts", /l\.id = e\.load_uuid AND l\.operating_company_id = e\.operating_company_id/],
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", /EntityLinkOrTombstone kind="driver" id=\{event\.driver_uuid\} name=\{event\.driver_name\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", /kind="load" id=\{event\.load_uuid\} label=\{entityLabel\(event\.load_number, event\.load_uuid, "Load"\)\}/],
  ["apps/frontend/src/pages/dispatch/DispatchOverview.tsx", /EntityLinkOrTombstone kind="driver" id=\{unit\.driver_id\} name=\{unit\.driver_name\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx", /EntityLinkOrTombstone kind="driver" id=\{load\.assigned_primary_driver_id\} name=\{load\.assigned_primary_driver_name\} noun="Driver"/],
  ["apps/frontend/src/components/dispatch/DispatchKanban.tsx", /kind="driver" id=\{load\.assigned_primary_driver_id\}/],
  ["apps/frontend/src/components/dispatch/DispatchList.tsx", /<InlineDriverPicker/],
  ["apps/frontend/src/pages/dispatch/RoundTrips.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", /kind="driver" id=\{row\.previous_driver_id\}/],
  ["apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", /kind="driver" id=\{load\.driver_id\}/],
  ["apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx", /kind="driver" id=\{event\.driver_id\}/],
  ["apps/frontend/src/components/border-crossing/WizardStep1.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", /kind="driver" id=\{selected\.driver_id\}/],
  ["apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx", /kind="driver" id=\{load\.driver_id\}/],
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", /kind="driver" id=\{u\.driver_id\}/],
  ["apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx", /EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx", /kind="driver" id=\{driver\.id\}/],
  ["apps/frontend/src/pages/dispatch/planners/SafetyDriverSchedulerGrid.tsx", /EntityLinkOrTombstone kind="driver" id=\{driverId\} name=\{name\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx", /EntityLinkOrTombstone kind="driver" id=\{row\.driverId\} name=\{row\.driverName\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx", /kind="driver" id=\{driver\.id\}/],
  ["apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx", /EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/],
  ["apps/frontend/src/pages/dispatch/PodReviewPage.tsx", /kind="driver" id=\{doc\.driver_id\}/],
  ["apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/dispatch/TripProfitability.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx", /kind="driver"/],
  ["apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", /kind="driver"/],
  ["apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", /import \{ getDispatchAvailableDrivers, type AvailableDriverRow \} from "\.\.\/\.\.\/api\/dispatch";/],
  ["apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx", /onClick=\{\(\) => onSelectDriver\(d\.driver_id\)\}/],
  ["apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx", /kind="driver"/],
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
console.log(`${LABEL} PASS — dispatch's 36 driver-scoped home/queue/planner/load/modal leaves are real`);
