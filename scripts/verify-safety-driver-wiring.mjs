#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^(driver_files\\.list|drug_alcohol\\.list|safety_meetings\\.(list|create)|training_records\\.list)$","task":"LINK-F5168-SAFETY-DRIVER-FILES-TRAINING"} */
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^(hos\\.list|hos_violations\\.list|eld_audit\\.list|idvr\\.list|dot_inspections\\.list|driver_scoring\\.list|dot_compliance\\.list)$","task":"LINK-F5168-SAFETY-DRIVER-HOS-INSPECTIONS"} */
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^(safety_events\\.list|accidents\\.(list|create)|damage_reports\\.(list|create)|trailer_interchanges\\.list)$","task":"LINK-F5168-SAFETY-DRIVER-EVENTS-INCIDENTS"} */
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^(cargo_claims\\.(list|create)|internal_fines\\.(list|create)|external_fines\\.(list|create)|complaints\\.list|escrow_record\\.list)$","task":"LINK-F5168-SAFETY-DRIVER-CLAIMS-FINES"} */
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^(driver_scheduler\\.list|leave_requests\\.list|leave_balances\\.list)$","task":"LINK-F5168-SAFETY-DRIVER-SCHEDULER"} */
/** @matrix-built {"modules":["safety"],"cols":["driver"],"leafRe":"^safety\\.(modal\\.(fine_create|hos_violation_create)|drawer\\.(accident_report|company_violation_detail|fine_detail|integrity_alert_detail|anomaly_detail)|panel\\.test_scheduling|parity\\.(accident_report|company_violation_detail|fine_create|fine_detail|integrity_alert_detail|anomaly_detail))$","task":"LINK-F5168-SAFETY-DRIVER-MODALS-DRAWERS"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 43 genuine safety leaves, each
 * confirmed live — a real driver_id/EntityLink kind="driver" row, a real EntityPicker/
 * DriverPickerWithCreate, or (AnomalyDetailDrawer) a real dynamic subject_type-to-kind map that
 * includes "driver". 10 sibling leaves were confirmed FALSE during this same sweep — see
 * safety.required.json honesty_audit["driver_column_2026_08_14_overclaim"].
 *
 * Self-test: node scripts/verify-safety-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx", /<DriversListPage onOpenProfile=\{\(nextDriverId\) => setDriverId\(nextDriverId\)\} \/>/],
  ["apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/TrainingRecordsPage.tsx", /kind="driver" id=\{id\}/],
  ["apps/frontend/src/pages/safety/HoursOfServicePage.tsx", /kind="driver" id=\{row\.driverId\}/],
  ["apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", /kind="driver" id=\{row\.driver_id as string \| undefined\}/],
  ["apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/safety/IdvrPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/driver-scoring/DriverScoringTab.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/safety/SafetyEventsPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/AccidentsPage.tsx", /kind="driver" id=\{row\.driver_id as string \| undefined\}/],
  ["apps/frontend/src/components/safety/AccidentReportDrawer.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/InternalFinesPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/FinesPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx", /kind="driver" id=\{entry\.driver_id\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx", /kind="driver" id=\{a\.primary_driver_id\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx", /kind="driver" id=\{String\(r\.driver_id \?\? ""\)\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverLeaveBalancesPage.tsx", /<EntityLink\s+kind="driver"\s+id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/safety/components/FineCreateModal.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx", /kind="driver" id=\{driverId\}/],
  ["apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx", /kind=\{anomaly\.subject_type\}/],
  ["apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx", /kind="driver"/],
  ["apps/backend/src/safety/events/safety-events.routes.ts", /safety_events_list_dca[\s\S]*?safety_events_list_dca\.driver_id = d\.id[\s\S]*?safety_events_list_dca\.company_id = e\.operating_company_id[\s\S]*?safety_events_list_dca\.is_authorized = true[\s\S]*?safety_events_list_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/events/safety-events.routes.ts", /safety_events_detail_dca[\s\S]*?safety_events_detail_dca\.driver_id = d\.id[\s\S]*?safety_events_detail_dca\.company_id = e\.operating_company_id[\s\S]*?safety_events_detail_dca\.is_authorized = true[\s\S]*?safety_events_detail_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/dvir.routes.ts", /safety_dvir_detail_dca[\s\S]*?safety_dvir_detail_dca\.driver_id = d\.id[\s\S]*?safety_dvir_detail_dca\.company_id = ds\.operating_company_id[\s\S]*?safety_dvir_detail_dca\.is_authorized = true[\s\S]*?safety_dvir_detail_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/incidents.routes.ts", /incident_detail_dca\.driver_id = d\.id[\s\S]{0,180}incident_detail_dca\.company_id = i\.operating_company_id[\s\S]{0,180}incident_detail_dca\.is_authorized = true[\s\S]{0,180}incident_detail_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/dot-inspection-events.routes.ts", /dot_inspection_list_dca\.driver_id = d\.id[\s\S]{0,180}dot_inspection_list_dca\.company_id = e\.operating_company_id[\s\S]{0,180}dot_inspection_list_dca\.is_authorized = true[\s\S]{0,180}dot_inspection_list_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/drug-program.routes.ts", /drug_tests_list_dca\.driver_id = d\.id[\s\S]{0,180}drug_tests_list_dca\.company_id = t\.operating_company_id[\s\S]{0,180}drug_tests_list_dca\.is_authorized = true[\s\S]{0,180}drug_tests_list_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/safety/drug-program.routes.ts", /random_pool_list_dca\.driver_id = d\.id[\s\S]{0,180}random_pool_list_dca\.company_id = p\.operating_company_id[\s\S]{0,180}random_pool_list_dca\.is_authorized = true[\s\S]{0,180}random_pool_list_dca\.deactivated_at IS NULL/],
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
console.log(`${LABEL} PASS — safety's driver-scoped UI leaves and shared-driver GET labels are real`);
