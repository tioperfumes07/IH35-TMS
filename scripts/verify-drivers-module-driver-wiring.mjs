#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^(home|profiles\\.(list|create|detail|documents)|pre_settlements|cash_advances|permits|deductions|team_splits|disputes)$","task":"LINK-F5168-DRIVERS-MODULE-CORE-WIRING"} */
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^drivers\\.modal\\.(add_training|create_driver|send_message|suspend_confirm|terminate_confirm|w8ben|driver_import|settlement_dispute)$","task":"LINK-F5168-DRIVERS-MODALS-WIRING"} */
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

const CHECKS = [
  ["apps/frontend/src/pages/Drivers.tsx", /kind="driver" id=\{isUuid\(row\.driver_id\) \? row\.driver_id : null\}/],
  ["apps/frontend/src/pages/drivers/DriversListPage.tsx", /listDrivers\(\{ operating_company_id: companyId, status: "All", search, limit: pageSize, offset: page \* pageSize \}\)/],
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
  ["apps/frontend/src/api/onboarding.ts", /driver_name: string \| null;/],
  ["apps/backend/src/safety/onboarding.routes.ts", /LEFT JOIN mdata\.drivers driver[\s\S]*?driver\.operating_company_id = session\.operating_company_id/],
  ["apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx", /kind="driver"/],
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
console.log(`${LABEL} PASS — drivers' 24 self-referential module leaves are real`);
