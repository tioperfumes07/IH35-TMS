#!/usr/bin/env node
/**
 * PLUS-DRIVER-SYSTEM — fail if any MUST-wire create-worthy driver picker file
 * lacks CreateDriverModal / DriverPickerWithCreate / "+ Create driver".
 *
 * Rule 17: verify-*.mjs + verify-steps only — do not touch package.json / CI yml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Locked allowlist — every create-worthy surface that must ship nested CreateDriverModal. */
const MUST_WIRE = [
  // Shared / specialized hosts (consumers inherit)
  "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx",
  "apps/frontend/src/components/factoring/DriverAutocomplete.tsx",
  "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",

  // Money / banking / settlements
  "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
  "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
  "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx",
  "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  // SKIP (not create-worthy — do not re-add to MUST_WIRE without owner GO):
  // - DriverEscrowTabContent: filter-only of existing escrow balances (no create path)
  // - DisputeQueuePage: status filter + decide modal; driver is display-only column
  // - FactoringHome vendor_merges: DriverAutocomplete lookup for existing-driver QBO merge

  // Insurance / legal / maint / fleet-adjacent (Law §9 class — insurance example)
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
  "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
  "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx",
  "apps/frontend/src/pages/UserDetail.tsx",

  // Dispatch — BookLoadModalV4 / LoadReassignModal inherit nested create via BookLoadEquipmentSection / AssignDriverDropdown (composition).
  "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
  // SKIP BookLoadModalV4: inherits via BookLoadEquipmentSection (same modal composition).
  // SKIP LoadReassignModal: inherits via AssignDriverDropdown (wired CreateDriverModal).
  "apps/frontend/src/components/fleet/QuickAssignModal.tsx",
  "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  // SKIP LoadReassignModal: inherits via AssignDriverDropdown.

  // Safety
  "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
  "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
  "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
  "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
  // SKIP HoursOfServicePage: create path uses HosViolationCreateModal (wired below).
  "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
  "apps/frontend/src/pages/safety/components/FineCreateModal.tsx",
  "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
];

/**
 * Optional create-worthy surfaces — if present on disk and still create-worthy,
 * they must pass the same markers. Files marked SKIP in the audit are omitted.
 */
const CONDITIONAL = [
  // SKIP HosHistorySection: FILTER_ONLY — driver Combobox selects audit history subject, no create action.
  // SKIP HosViewerSection: FILTER_ONLY — driver Combobox selects HOS timeline subject, no create action.
];

function hasCreateMarker(src) {
  // LST-PICKER-01: EntityPicker kind=driver owns nested create (CreateDriverModal inside EntityPicker).
  const entityPickerDriver =
    src.includes("EntityPicker") && /kind=["']driver["']/.test(src);
  return (
    src.includes("CreateDriverModal") ||
    src.includes("DriverPickerWithCreate") ||
    src.includes("+ Create driver") ||
    entityPickerDriver
  );
}

const failures = [];
const checked = [];

for (const rel of MUST_WIRE) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    failures.push(`MISSING FILE (must-wire): ${rel}`);
    continue;
  }
  const src = readFileSync(abs, "utf8");
  checked.push(rel);
  if (!hasCreateMarker(src)) {
    failures.push(`NO nested CreateDriverModal / DriverPickerWithCreate / "+ Create driver": ${rel}`);
  }
}

for (const rel of CONDITIONAL) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, "utf8");
  // Only enforce if the file still has a driver select/combobox create-worthy surface
  // (heuristic: listDrivers or driver_id / driverId near select/combobox).
  const looksLikePicker =
    /listDrivers\s*\(/.test(src) &&
    (/SelectCombobox|Combobox|<select[\s>]|driver_id|driverId|selectedDriver/.test(src));
  if (!looksLikePicker) continue;
  checked.push(rel);
  if (!hasCreateMarker(src)) {
    failures.push(`CONDITIONAL create-worthy without nested create: ${rel}`);
  }
}

if (failures.length) {
  console.error("FAIL verify-plus-driver-system-create");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\nChecked ${checked.length} paths. Fix: wire CreateDriverModal or DriverPickerWithCreate.`);
  process.exit(1);
}

console.log(`PASS verify-plus-driver-system-create (${checked.length} must-wire paths)`);
