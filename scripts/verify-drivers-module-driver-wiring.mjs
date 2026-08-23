#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^(home|profiles\\.(list|create|detail|documents)|pre_settlements|cash_advances|permits|deductions|team_splits|disputes)$","task":"LINK-F5168-DRIVERS-MODULE-CORE-WIRING"} */
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^drivers\\.modal\\.(add_training|create_driver|send_message|suspend_confirm|terminate_confirm|w8ben|driver_import|settlement_dispute)$","task":"LINK-F5168-DRIVERS-MODALS-WIRING"} */
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.modal.add_training","drivers.modal.create_driver","drivers.modal.send_message","drivers.modal.suspend_confirm","drivers.modal.terminate_confirm","drivers.modal.w8ben","drivers.modal.driver_import","drivers.modal.settlement_dispute"],"task":"DRV-F5923-MODAL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.panel.pending_settlement_deductions","drivers.panel.driver_dqf","drivers.wizard.onboarding_wizard_page","drivers.parity.create_driver","drivers.parity.driver_picker_with_create"],"task":"DRV-F5924-PANEL-WIZARD-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["profiles.list","profiles.create","profiles.documents"],"task":"DRV-F5926-PROFILES-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^(drivers\\.panel\\.(pending_settlement_deductions|driver_dqf)|drivers\\.wizard\\.onboarding_wizard_page|drivers\\.parity\\.(create_driver|driver_picker_with_create))$","task":"LINK-F5168-DRIVERS-PANELS-WIZARD-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 24 genuine drivers-module leaves —
 * the module's OWN native pages, all self-referential to a real driver record (real driver_id,
 * EntityLink kind="driver", or a real create/action call taking driverId). 2 sibling leaves
 * (pay_rate_templates, leave) were confirmed FALSE during this same sweep — see
 * drivers.required.json honesty_audit["driver_column_2026_08_14_overclaim"].
 *
 * Self-test: node scripts/verify-drivers-module-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-module-driver-wiring";
const REQUIRED = "docs/specs/scoreboard/modules/drivers.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-drivers-module-driver-wiring.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.modal.add_training","drivers.modal.create_driver","drivers.modal.send_message","drivers.modal.suspend_confirm","drivers.modal.terminate_confirm","drivers.modal.w8ben","drivers.modal.driver_import","drivers.modal.settlement_dispute"],"task":"DRV-F5923-MODAL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const PANEL_HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.panel.pending_settlement_deductions","drivers.panel.driver_dqf","drivers.wizard.onboarding_wizard_page","drivers.parity.create_driver","drivers.parity.driver_picker_with_create"],"task":"DRV-F5924-PANEL-WIZARD-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const PROFILES_HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["profiles.list","profiles.create","profiles.documents"],"task":"DRV-F5926-PROFILES-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const MODAL_ROUTES = new Map([
  ["drivers.modal.add_training", "surface://components/drivers/AddTrainingModal.tsx"],
  ["drivers.modal.create_driver", "surface://components/drivers/CreateDriverModal.tsx"],
  ["drivers.modal.send_message", "surface://components/drivers/SendMessageModal.tsx"],
  ["drivers.modal.suspend_confirm", "surface://components/drivers/SuspendConfirmModal.tsx"],
  ["drivers.modal.terminate_confirm", "surface://components/drivers/TerminateConfirmModal.tsx"],
  ["drivers.modal.w8ben", "surface://components/drivers/W8BenModal.tsx"],
  ["drivers.modal.driver_import", "surface://pages/drivers/DriverImportModal.tsx"],
  ["drivers.modal.settlement_dispute", "surface://pages/drivers/SettlementDisputeModal.tsx"],
]);
const PANEL_ROUTES = new Map([
  ["drivers.panel.pending_settlement_deductions", "surface://pages/drivers/PendingSettlementDeductionsPanel.tsx"],
  ["drivers.panel.driver_dqf", "surface://pages/drivers/components/DriverDqfPanel.tsx"],
  ["drivers.wizard.onboarding_wizard_page", "surface://pages/drivers/OnboardingWizardPage.tsx"],
  ["drivers.parity.create_driver", "surface://components/drivers/CreateDriverModal.tsx"],
  ["drivers.parity.driver_picker_with_create", "surface://components/drivers/DriverPickerWithCreate.tsx"],
]);
const PROFILE_ROUTES = new Map([
  ["profiles.list", "/drivers/profiles"],
  ["profiles.create", "/drivers/profiles"],
  ["profiles.documents", "/drivers/:id"],
]);

const CHECKS = [
  ["apps/frontend/src/pages/Drivers.tsx", /kind="driver" id=\{isUuid\(row\.driver_id\) \? row\.driver_id : null\}/],
  ["apps/frontend/src/pages/drivers/DriversListPage.tsx", /listDrivers\(\{ operating_company_id: companyId, status: "All", search, limit: pageSize, offset: page \* pageSize \}\)/],
  ["apps/frontend/src/pages/drivers/DriversListPage.tsx", /dqfQ\.isError[\s\S]{0,220}Couldn't load driver DQF summaries[\s\S]{0,220}onRetry=\{\(\) => void dqfQ\.refetch\(\)\}/],
  ["apps/frontend/src/components/drivers/CreateDriverModal.tsx", /driver_id: created\.id,/],
  ["apps/frontend/src/pages/drivers/DriverProfilePage.tsx", /function fetchDriverProfile\(driverId: string, operatingCompanyId: string\)/],
  ["apps/frontend/src/pages/drivers/operations/DocumentsVaultView.tsx", /type Props = \{ driverId: string; operatingCompanyId: string \};/],
  ["apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/drivers/TeamSplitConfig.tsx", /kind="driver" id=\{row\.primary_driver_id\}/],
  ["apps/frontend/src/pages/drivers/SettlementDisputeList.tsx", /kind="driver"/],
  ["apps/frontend/src/components/drivers/AddTrainingModal.tsx", /await createDriverTrainingRecord\(driverId, companyId, \{/],
  ["apps/frontend/src/components/drivers/SendMessageModal.tsx", /await sendDriverProfileMessage\(driverId, companyId, \{/],
  ["apps/frontend/src/components/drivers/SuspendConfirmModal.tsx", /await suspendDriver\(driverId, reason\.trim\(\)\);/],
  ["apps/frontend/src/components/drivers/TerminateConfirmModal.tsx", /await createSafetyEvent\(driverId, \{/],
  ["apps/frontend/src/components/drivers/W8BenModal.tsx", /await createDriverW8ben\(driverId, companyId, \{/],
  ["apps/frontend/src/pages/drivers/DriverImportModal.tsx", /const res = await importDriversCsv\(file, companyId, "preview"\);/],
  ["apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx", /driver_id: driverId,/],
  ["apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx", /listDriverQualificationItems\(driverId, companyId\)/],
  ["apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx", /entity_links: driverId \? \[\{ entity_type: "driver", entity_id: driverId \}\] : undefined,/],
  ["apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx", /<EntityLinkOrTombstone[\s\S]*?id=\{driverId\}[\s\S]*?name=\{session\.driver_name\}[\s\S]*?noun="Driver"/],
  ["apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx", /<EntityLinkOrTombstone[\s\S]*?id=\{id\}[\s\S]*?name=\{driverName\}[\s\S]*?noun="Driver"/],
  ["apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx", /<EntityLinkOrTombstone[\s\S]*?id=\{driverId\}[\s\S]*?name=\{driverName\}[\s\S]*?noun="Driver"/],
  ["apps/frontend/src/pages/drivers/MessagesInboxPage.tsx", /threadQuery\.isError[\s\S]{0,220}Couldn't load message thread[\s\S]{0,220}onRetry=\{\(\) => void threadQuery\.refetch\(\)\}/],
  ["apps/frontend/src/components/drivers/DriverLateArrivalCard.tsx", /query\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void query\.refetch\(\)\}/],
  ["apps/frontend/src/api/onboarding.ts", /driver_name: string \| null;/],
  ["apps/backend/src/safety/onboarding.routes.ts", /LEFT JOIN mdata\.drivers driver[\s\S]*?driver\.operating_company_id = session\.operating_company_id/],
  ["apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx", /kind="driver"/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
  }
  if (files[REQUIRED]) {
    const required = JSON.parse(files[REQUIRED]);
    for (const [id, route] of MODAL_ROUTES) {
      const leaf = required.leaves?.find((row) => row.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${REQUIRED}: ${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${REQUIRED}: ${id} must name route ${route}`);
    }
    for (const [id, route] of PANEL_ROUTES) {
      const leaf = required.leaves?.find((row) => row.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${REQUIRED}: ${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${REQUIRED}: ${id} must name route ${route}`);
    }
    for (const [id, route] of PROFILE_ROUTES) {
      const leaf = required.leaves?.find((row) => row.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${REQUIRED}: ${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${REQUIRED}: ${id} must name route ${route}`);
    }
  }
  if (files[SELF] && !files[SELF].split("/**\n * OWNER-")[0].includes(EXACT_HEADER)) failures.push(`${SELF}: exact driver modal connectivity header missing`);
  if (files[SELF] && !files[SELF].split("/**\n * OWNER-")[0].includes(PANEL_HEADER)) failures.push(`${SELF}: exact driver panel/wizard connectivity header missing`);
  if (files[SELF] && !files[SELF].split("/**\n * OWNER-")[0].includes(PROFILES_HEADER)) failures.push(`${SELF}: exact driver profiles connectivity header missing`);
  if (files[FEED] && /"guard"\s*:\s*"scripts\/verify-drivers-module-driver-wiring\.mjs"/.test(files[FEED])) failures.push(`${FEED}: manual feed duplicates exact driver modal connectivity`);
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set([...CHECKS.map(([f]) => f), REQUIRED, FEED, SELF])];
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
  for (const id of MODAL_ROUTES.keys()) {
    const mutated = { ...good, [REQUIRED]: good[REQUIRED].replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (mutated[REQUIRED] === good[REQUIRED] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${id}`);
      process.exit(1);
    }
    caught++;
  }
  for (const id of PANEL_ROUTES.keys()) {
    const mutated = { ...good, [REQUIRED]: good[REQUIRED].replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (mutated[REQUIRED] === good[REQUIRED] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Panel Required mutation escaped: ${id}`);
      process.exit(1);
    }
    caught++;
  }
  for (const id of PROFILE_ROUTES.keys()) {
    const mutated = { ...good, [REQUIRED]: good[REQUIRED].replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (mutated[REQUIRED] === good[REQUIRED] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Profile Required mutation escaped: ${id}`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, key, before, after] of [
    ["header", SELF, EXACT_HEADER, EXACT_HEADER.replace("connectivity", "reverse_link")],
    ["panel-header", SELF, PANEL_HEADER, PANEL_HEADER.replace("connectivity", "reverse_link")],
    ["profiles-header", SELF, PROFILES_HEADER, PROFILES_HEADER.replace("connectivity", "reverse_link")],
    ["feed", FEED, "[", `[{"guard":"scripts/verify-drivers-module-driver-wiring.mjs"},`],
  ]) {
    const mutated = { ...good, [key]: good[key].replace(before, after) };
    if (mutated[key] === good[key] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} evidence mutation escaped`);
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
console.log(`${LABEL} PASS — drivers' 24 self-referential module leaves are real`);
