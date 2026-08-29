#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["driver"],"leafRe":"^(card_overage|history|fuel\\.modal\\.create_fuel_transaction)$","task":"LINK-F5168-FUEL-DRIVER-WIRING"} */
/** @matrix-built {"modules":["home"],"cols":["driver"],"leafRe":"^(role\\.owner|hub\\.driver|hub\\.driver_reporting)$","task":"LINK-F5168-HOME-DRIVER-WIRING"} */
/** @matrix-built {"modules":["driver-hub"],"cols":["driver"],"leafRe":"^(home|tab\\.(overview|scheduler|leave_requests)|reporting|inbox)$","task":"LINK-F5168-DRIVERHUB-DRIVER-WIRING"} */
/** @matrix-built {"modules":["tasks"],"cols":["driver"],"leafRe":"^(nav\\.(board|mine)|board\\.(planner_grid|create)|mine\\.list)$","task":"LINK-F5168-TASKS-DRIVER-WIRING"} */
/** @matrix-built {"modules":["docs"],"cols":["driver"],"leafRe":"^(home|tab\\.(all|driver)|upload|table\\.entity_link)$","task":"LINK-F5168-DOCS-DRIVER-WIRING"} */
/** @matrix-built {"modules":["legal"],"cols":["driver"],"leafRe":"^(contracts\\.(list|create)|matters\\.(create|detail))$","task":"LINK-F5168-LEGAL-DRIVER-WIRING"} */
/** @matrix-built {"modules":["accounting"],"cols":["driver"],"leafRe":"^(escrow|pre_settlements|accounting\\.modal\\.driver_(damage|misc)_invoice)$","task":"LINK-F5168-ACCOUNTING-DRIVER-WIRING"} */
/** @matrix-built {"modules":["vendors"],"cols":["driver"],"leafRe":"^detail\\.profile(\\.driver_link)?$","task":"LINK-F5168-VENDORS-DRIVER-WIRING"} */
/** @matrix-built {"modules":["banking"],"cols":["driver"],"leafRe":"^driver_escrow$","task":"LINK-F5168-BANKING-DRIVER-WIRING"} */
/** @matrix-built {"modules":["factoring"],"cols":["driver"],"leafRe":"^(home\\.vendor_merges|factoring\\.parity\\.driver_autocomplete)$","task":"LINK-F5168-FACTORING-DRIVER-WIRING"} */
/** @matrix-built {"modules":["system"],"cols":["driver"],"leafRe":"^(system\\.samsara_hos_driver_map|audit\\.trail)$","task":"LINK-F5168-SYSTEM-DRIVER-WIRING"} */
/** @matrix-built {"modules":["customers"],"cols":["driver"],"leafRe":"^detail\\.loads$","task":"LINK-F5168-CUSTOMERS-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 38 genuine leaves across the 12
 * remaining small driver-column modules, each confirmed live — a real driver_id/EntityLink
 * kind="driver" row, a real EntityPicker kind="driver", or a real dynamic entity-kind map
 * (TaskSubjectLink/DocsHomePage/AuditTrailPage/LegalContractInstancesPage) that includes driver.
 *
 * Self-test: node scripts/verify-driver-column-remaining-modules.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-column-remaining-modules";

const CHECKS = [
  // fuel: card_overage, history, fuel.modal.create_fuel_transaction
  ["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx", /kind="driver" id=\{row\.driver_id \?\? undefined\}/],
  ["apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx", /kind="driver" id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx", /<EntityPicker\s*\n\s*kind="driver"/],
  // home: role.owner, hub.driver, hub.driver_reporting
  ["apps/frontend/src/pages/home/OwnerHome.tsx", /kind="driver"[\s\S]{0,40}id=\{String\(r\.driver_id \?\? ""\)\}/],
  ["apps/frontend/src/components/driver-inbox/DriverInbox.tsx", /kind="driver" id=\{String\(row\.driver_id \?\? ""\)\}/],
  ["apps/frontend/src/pages/home/DriverHubReportingPage.tsx", /kind="driver" id=\{r\.driver_id\}/],
  // driver-hub: home, tab.overview, tab.scheduler, tab.leave_requests, reporting, inbox
  ["apps/frontend/src/pages/home/DriverHubPage.tsx", /\{tab === "overview" && <DriverInbox\s+(?=[^>]*companyId=\{companyId\})(?=[^>]*canReview=\{canReview\})[^>]*\/>\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx", /kind="driver" id=\{a\.primary_driver_id\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx", /kind="driver" id=\{String\(r\.driver_id \?\? ""\)\}/],
  // tasks: nav.board, nav.mine, board.planner_grid, board.create, mine.list
  ["apps/frontend/src/components/tasks/TaskSubjectLink.tsx", /driver: "driver",/],
  // EntityPicker kinds include load (tasks + docs upload) — still require driver in the union.
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /kind=\{entityKind as "customer" \| "vendor" \| "driver" \| "unit" \| "load"\}/],
  ["apps/backend/src/tasks/task.routes.ts", /FROM mdata\.driver_company_authorizations task_list_subject_dca[\s\S]{0,180}task_list_subject_dca\.driver_id = subject_driver\.id[\s\S]{0,140}task_list_subject_dca\.company_id = t\.operating_company_id[\s\S]{0,140}task_list_subject_dca\.is_authorized = true[\s\S]{0,140}task_list_subject_dca\.deactivated_at IS NULL/],
  ["apps/backend/src/tasks/task.routes.ts", /FROM mdata\.driver_company_authorizations task_calendar_subject_dca[\s\S]{0,180}task_calendar_subject_dca\.driver_id = subject_driver\.id[\s\S]{0,140}task_calendar_subject_dca\.company_id = t\.operating_company_id[\s\S]{0,140}task_calendar_subject_dca\.is_authorized = true[\s\S]{0,140}task_calendar_subject_dca\.deactivated_at IS NULL/],
  // docs: home, tab.all, tab.driver, upload, table.entity_link
  ["apps/frontend/src/pages/docs/DocsHomePage.tsx", /case "driver":/],
  ["apps/frontend/src/components/documents/UploadModal.tsx", /type StandaloneLinkType = "driver" \| "unit" \| "vendor" \| "customer" \| "load";[\s\S]{0,500}function standaloneLinkToPickerKind\(type: StandaloneLinkType\): EntityPickerKind \{\s*return type;\s*\}/],
  // legal: contracts.list, contracts.create, matters.create, matters.detail
  ["apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", /if \(type === "driver" \|\| type === "customer" \|\| type === "vendor"\) return type;/],
  ["apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx", /<DriverPickerWithCreate/],
  ["apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx", /related_driver_id: optionalUuidOrNull\(form\.related_driver_id\)/],
  ["apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx", /kind="driver"[\s\S]{0,40}id=\{String\(matter\.related_driver_id\)\}/],
  // accounting: escrow, pre_settlements, accounting.modal.driver_damage_invoice, accounting.modal.driver_misc_invoice
  ["apps/frontend/src/pages/accounting/EscrowPage.tsx", /row\.holder_type === "driver" \? \(/],
  ["apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx", /billToEntityType === "driver" \|\| billToEntityType === "vendor"/],
  // vendors: detail.profile, detail.profile.driver_link
  // Multi-line JSX attrs (kind="driver" / id={vendor.driver_id} on separate lines, Prettier
  // default): [\s\S]{0,20} tolerates the line break without loosening which two props must
  // co-occur.
  ["apps/frontend/src/pages/VendorDetail.tsx", /kind="driver"[\s\S]{0,20}id=\{vendor\.driver_id\}/],
  // banking: driver_escrow
  ["apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx", /to=\{`\/drivers\/\$\{selectedDriver\.driver_id\}`\}/],
  // factoring: home.vendor_merges, factoring.parity.driver_autocomplete
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver" \/>/],
  ["apps/frontend/src/components/factoring/DriverAutocomplete.tsx", /kind="driver"/],
  // system: system.samsara_hos_driver_map, audit.trail
  ["apps/frontend/src/pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx", /kind="driver"[\s\S]{0,20}id=\{row\.local_driver_id\}/],
  ["apps/frontend/src/pages/audit/AuditTrailPage.tsx", /driver: "driver",/],
  // customers: detail.loads
  ["apps/frontend/src/pages/CustomerDetail.tsx", /kind="driver"[\s\S]{0,40}id=\{load\.assigned_primary_driver_id\}/],
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
console.log(`${LABEL} PASS — 38 driver-scoped leaves across fuel/home/driver-hub/tasks/docs/legal/accounting/vendors/banking/factoring/system/customers are real`);
