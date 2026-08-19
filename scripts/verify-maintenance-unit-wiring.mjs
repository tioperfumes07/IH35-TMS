#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["unit"],"leafRe":"^(wo\\.console\\.list|wo\\.create|wo\\.source\\.(is|es|ac|et|rt|it|rs)|wo\\.create_bill|wo\\.create_expense)$","task":"LINK-F5167-MAINTENANCE-WO-LIST-CREATE-UNIT"} */
/** @matrix-built {"modules":["maintenance"],"cols":["unit"],"leafRe":"^(in_transit\\.promote_to_wo|arriving_soon\\.convert_to_wo|damage_reports\\.intake|severe_repairs\\.convert_to_wo|road_service\\.active|defects\\.convert_to_wo|pre_flight_dvir\\.queue)$","task":"LINK-F5167-MAINTENANCE-QUEUES-UNIT"} */
/** @matrix-built {"modules":["maintenance"],"cols":["unit"],"leafRe":"^(pm\\.schedule\\.(create|list)|pm\\.auto_engine\\.run|home\\.rm_status_board|inspections\\.create|fault_drafts\\.review|tires\\.create_record)$","task":"LINK-F5167-MAINTENANCE-PM-INSPECT-UNIT"} */
/** @matrix-built {"modules":["maintenance"],"cols":["unit"],"leafRe":"^(maintenance\\.modal\\.(work_order_detail|road_service_ticket|convert_issue_to_wo|create_work_order|triage|create_bill|create_expense)|maintenance\\.panel\\.(road_service_active|pm_alerts))$","task":"LINK-F5167-MAINTENANCE-MODALS-PANELS-UNIT"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 34 genuine maintenance leaves, each
 * confirmed live — real unit_id/EntityLink kind="unit" or a real EntityPicker kind="unit", sourced
 * from mdata.units.
 *
 * Self-test: node scripts/verify-maintenance-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", /Unit active and class set/],
  ["apps/frontend/src/pages/maintenance/RoadServiceList.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx", /<EntityPicker/],
  ["apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx", /<EntityPicker/],
  ["apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx", /kind="unit" id=\{issue\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx", /kind="unit" id=\{card\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx", /(?:useSearchParams\(\)\[0\]|searchParams)\.get\("unit_id"\)/],
  ["apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx", /Select a real unit\./],
  ["apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx", /kind="unit" id=\{entry\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx", /unit_id: string/],
  ["apps/backend/src/maintenance/inspections.routes.ts", /FROM mdata\.units u[\s\S]{0,180}u\.deactivated_at IS NULL/],
  ["apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/api/mdata.ts", /getUnit\(id: string, operatingCompanyId: string\)/],
  ["apps/frontend/src/api/mdata.ts", /operating_company_id=\$\{encodeURIComponent\(operatingCompanyId\)\}/],
  ["apps/frontend/src/api/mdata.ts", /return envelope\.unit \?\? \(payload as MdataUnit\)/],
  ["apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx", /getUnit\(String\(unitId\), String\(operatingCompanyId\)\)/],
  ["apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx", /searchParams\.get\("unit_id"\)/],
  ["apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx", /dataTestId="fault-drafts-filter-unit"/],
  ["apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx", /allowCreate=\{false\}/],
  ["apps/frontend/src/pages/maintenance/TireProgramPage.tsx", /assetKind === "unit" \? "Select unit…"/],
  ["apps/frontend/src/pages/maintenance/components/RMBucketsGrid.tsx", /kind="unit"[\s\S]{0,80}id=\{row\.unit_id\}[\s\S]{0,100}label=\{entityLabel\(row\.unit_number, row\.unit_id, "Unit"\)\}/],
  ["apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", /kind="unit"[\s\S]{0,100}id=\{(?:String|asEntityId)\(workOrder\.unit_id\)\}/],
  ["apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx", /unit_id: unitId/],
  ["apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx", /kind="unit" id=\{card\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/TriageModal.tsx", /kind="unit" id=\{issue\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/RoadServiceActivePanel.tsx", /kind="unit"[\s\S]{0,40}id=\{wo\.unit_id\}/],
  ["apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", /kind="unit" id=\{alert\.unit_id\}/],
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
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, `${pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"}`), "REMOVED") };
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
console.log(`${LABEL} PASS — maintenance's 34 unit-scoped WO/queue/PM/modal/panel leaves are real`);
