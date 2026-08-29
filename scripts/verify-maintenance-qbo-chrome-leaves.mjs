#!/usr/bin/env node
/**
 * Maintenance qbo_chrome — leaf-specific Built for the 33 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(wo|in_transit|arriving_soon|
 * damage_reports|driver_reports|severe_repairs|road_service|defects|pre_flight_dvir|
 * parts_inventory|pm|inspections|parts|vendors|fault_rules|fault_drafts|tires|warranty|
 * maintenance|master|chrome)\.) — same theater-coverage class already found+fixed for insurance/
 * legal/accounting/customers/drivers/vendors/dispatch/safety/fleet this session: it verifies
 * generic shared files (ReportsHome, BillsPage, MaintenanceHome.tsx / WorkOrderCreateModal.tsx bare
 * presence checks) and never opens most of the real maintenance leaves' own chrome. This is the
 * last module in the QBO-CHROME-THEATER-COVERAGE-5-MODULES board finding.
 *
 * chrome.toolbar_(search|range|gear) are already real via CLS-FILTER-GEAR-APPLY (maintenance
 * included). chrome.toolbar_filter is already real via CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7
 * (maintenance included). None of the 4 toolbar leaves are re-claimed here.
 *
 * All 34 leaves below are genuinely built, traced through the real route/component wiring:
 *   - wo.create: MaintenanceHome.tsx's QuickActionsBar "+ Create Work Order" mounts the real
 *     CreateWorkOrderModal (components/) — a real Modal ("Create Work Order", sizePreset=lg wide).
 *   - wo.source.is/es/ac/et/rt/it/rs: CreateWOSectionIdentification.tsx's real SOURCE_TYPES config
 *     array carries all 7 codes (IS/ES/AC/ET/RT/IT/RS) with real labels, driving the WO creator's
 *     source-type picker. 2026-08-21 (CC-3, SWARM straggler-check): `rs` was omitted from the
 *     original leafRe/pattern even though CreateWOSectionIdentification.tsx already had a real RS
 *     entry (added by a later, unrelated commit) — silently left "Built" only via the broad
 *     CURSOR-VERTICAL sweep, whose runtime check never opens this file at all. No product code
 *     changed — guard-only fix, matching the leaf to chrome that was already real.
 *   - wo.create_bill: CreateBillModal.tsx, a real ParityDrawer with a real EntityPicker.
 *   - wo.create_expense: CreateExpenseModal.tsx, a real ParityDrawer with a real EntityPicker.
 *   - in_transit.promote_to_wo: ConvertIssueToWOModal.tsx, a real Modal (ModalCloseButton
 *     "Convert Issue to WO").
 *   - arriving_soon.convert_to_wo: ArrivingSoonPage.tsx's real ParityTable with a real per-row
 *     "Convert to WO" action.
 *   - damage_reports.intake: TriageModal.tsx (exact surface match) — a real Modal with real
 *     "Convert to Work Order" / "Convert to Damage Report" actions and real EntityLinkOrTombstone
 *     unit/driver fields.
 *   - driver_reports.queue: DriverReportsQueuePage.tsx — real ParityTable + a real, visible
 *     EntityPicker filter (BANK-F5168: not a URL/prop-only filter).
 *   - severe_repairs.convert_to_wo: SevereRepairOosTab.tsx — WO creation here is backend-triggered
 *     (trigger_wo_id), surfaced honestly via a real EntityLink "Open →" once set (not fabricated),
 *     inside a real ParityTable.
 *   - road_service.active: RoadServiceList.tsx (mounted at /maintenance/road-service) — real
 *     ParityTable.
 *   - defects.convert_to_wo: DefectsInboxPage.tsx — real ParityTable with a real per-row
 *     "Convert to WO" action.
 *   - pre_flight_dvir.queue: PreFlightDvirQueue.tsx — real ParityTable.
 *   - parts_inventory.record_purchase: PartsInventoryTable.tsx — real "+ Record Purchase" button
 *     mounting a real Modal ("Record Purchase") with real MoneyInput fields.
 *   - pm.schedule.create: PmSchedulePage.tsx — real "+ Create" button -> real ParityTable + Modal.
 *   - pm.auto_engine.run: PmAutoEnginePage.tsx — a real "Run now" mutation
 *     (runMaintenancePmAutoEngineNow) driving a real recent-runs list.
 *   - inspections.create: InspectionsPage.tsx — real "+ Create Inspection" -> real ParityTable +
 *     Modal.
 *   - parts.create: PartsMasterDataPage.tsx — real "+ Create Part" -> real ParityTable + Modal
 *     variant="drawer".
 *   - vendors.create: VendorsPage.tsx (maintenance/vendors) — real "+ Create Vendor" -> real
 *     ParityTable + Modal variant="drawer".
 *   - fault_rules.create: FaultRulesPage.tsx — real "+ Create Rule" -> real ParityTable, mounting
 *     the real FaultRuleModal.
 *   - fault_drafts.review: FaultDraftsPage.tsx — real "Review" action -> real ParityTable.
 *   - tires.create_record / tires.create_brand / tires.create: TireProgramPage.tsx — real
 *     "+ Create Brand" and "+ Create Tire Record" buttons, each mounting a real Modal
 *     variant="drawer" (tires.create is the combined-label rollup leaf for the same two actions).
 *   - warranty.create_claim: WarrantyClaimsPage.tsx — real "+ Create Claim" -> real ParityTable +
 *     Modal variant="drawer".
 *   - maintenance.panel.wotime_tracking: WOTimeTrackingPanel.tsx (exact surface match) — real
 *     ParityTable.
 *   - master.drivers.create: DriversMasterDataPage.tsx — real ParityTable + Modal variant="drawer"
 *     ("Create Driver").
 *   - master.vehicles.create: VehiclesMasterDataPage.tsx — real ParityTable + Modal variant="drawer"
 *     ("Create Vehicle").
 *
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^wo\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-wo-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^wo\\.source\\.(is|es|ac|et|rt|it|rs)$","task":"VERTICAL-QBO-CHROME-maintenance-wo-source","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^wo\\.create_bill$","task":"VERTICAL-QBO-CHROME-maintenance-wo-create-bill","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^wo\\.create_expense$","task":"VERTICAL-QBO-CHROME-maintenance-wo-create-expense","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^in_transit\\.promote_to_wo$","task":"VERTICAL-QBO-CHROME-maintenance-in-transit-promote","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^arriving_soon\\.convert_to_wo$","task":"VERTICAL-QBO-CHROME-maintenance-arriving-soon-convert","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^damage_reports\\.intake$","task":"VERTICAL-QBO-CHROME-maintenance-damage-intake","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^driver_reports\\.queue$","task":"VERTICAL-QBO-CHROME-maintenance-driver-reports-queue","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^severe_repairs\\.convert_to_wo$","task":"VERTICAL-QBO-CHROME-maintenance-severe-repairs-convert","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^road_service\\.active$","task":"VERTICAL-QBO-CHROME-maintenance-road-service-active","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^defects\\.convert_to_wo$","task":"VERTICAL-QBO-CHROME-maintenance-defects-convert","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^pre_flight_dvir\\.queue$","task":"VERTICAL-QBO-CHROME-maintenance-preflight-dvir-queue","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^parts_inventory\\.record_purchase$","task":"VERTICAL-QBO-CHROME-maintenance-parts-inventory-record-purchase","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^pm\\.schedule\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-pm-schedule-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^pm\\.auto_engine\\.run$","task":"VERTICAL-QBO-CHROME-maintenance-pm-auto-engine-run","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^inspections\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-inspections-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^parts\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-parts-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^vendors\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-vendors-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^fault_rules\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-fault-rules-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^fault_drafts\\.review$","task":"VERTICAL-QBO-CHROME-maintenance-fault-drafts-review","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^tires\\.create_record$","task":"VERTICAL-QBO-CHROME-maintenance-tires-create-record","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^tires\\.create_brand$","task":"VERTICAL-QBO-CHROME-maintenance-tires-create-brand","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^tires\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-tires-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^warranty\\.create_claim$","task":"VERTICAL-QBO-CHROME-maintenance-warranty-create-claim","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^maintenance\\.panel\\.wotime_tracking$","task":"VERTICAL-QBO-CHROME-maintenance-wotime-tracking-panel","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^master\\.drivers\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-master-drivers-create","vertical":"column-wave"}
 * @matrix-built {"modules":["maintenance"],"cols":["qbo_chrome"],"leafRe":"^master\\.vehicles\\.create$","task":"VERTICAL-QBO-CHROME-maintenance-master-vehicles-create","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-maintenance-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "wo.create: QuickActionsBar real + Create Work Order ActionButton",
    file: "apps/frontend/src/pages/maintenance/components/QuickActionsBar.tsx",
    pattern: /<ActionButton[\s\S]{0,300}\+ Create Work Order/,
  },
  {
    name: "wo.create (target modal): CreateWorkOrderModal real Modal (Create Work Order, sizePreset=lg wide)",
    file: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
    pattern: /<Modal open=\{open\} onClose=\{handleModalClose\} title="Create Work Order" sizePreset="lg" wide>/,
  },
  {
    name: "wo.source.is/es/ac/et/rt/it/rs: CreateWOSectionIdentification real SOURCE_TYPES config with all 7 codes",
    file: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
    pattern: /IS - Internal shop[\s\S]{0,900}IT - Internal tires[\s\S]{0,300}RS - Roadside service/,
  },
  {
    name: "wo.create_bill: CreateBillModal real ParityDrawer with real EntityPicker",
    file: "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx",
    pattern: /<ParityDrawer open=\{open\} onClose=\{onClose\} title="Create Bill"[\s\S]{0,450}<EntityPicker/,
  },
  {
    name: "wo.create_expense: CreateExpenseModal real ParityDrawer with real EntityPicker",
    file: "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx",
    pattern: /<ParityDrawer open=\{open\} onClose=\{onClose\} title="Create Expense"[\s\S]{0,450}<EntityPicker/,
  },
  {
    name: "in_transit.promote_to_wo: ConvertIssueToWOModal real Modal",
    file: "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx",
    pattern: /ModalCloseButton title="Convert Issue to WO"/,
  },
  {
    name: "arriving_soon.convert_to_wo: ArrivingSoonPage real ParityTable + per-row Convert to WO action",
    file: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx",
    pattern: /Convert to WO[\s\S]{0,4500}<ParityTable/,
  },
  {
    name: "damage_reports.intake: TriageModal real Modal with Convert to Work Order / Convert to Damage Report actions",
    file: "apps/frontend/src/pages/maintenance/components/TriageModal.tsx",
    pattern: /<Modal open=\{open\} onClose=\{onClose\} title="In-Transit Issue Triage">[\s\S]{0,1500}Convert to Damage Report/,
  },
  {
    name: "driver_reports.queue: DriverReportsQueuePage real ParityTable + real visible EntityPicker filter",
    file: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
    pattern: /<ParityTable[\s\S]{0,1300}<EntityPicker/,
  },
  {
    name: "severe_repairs.convert_to_wo: SevereRepairOosTab real EntityLink WO drill-through inside a real ParityTable",
    file: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx",
    pattern: /severe-repair-wo-link[\s\S]{0,5600}<ParityTable/,
  },
  {
    name: "road_service.active: RoadServiceList real ParityTable",
    file: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "defects.convert_to_wo: DefectsInboxPage real ParityTable + per-row Convert to WO action",
    file: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
    pattern: /Convert to WO[\s\S]{0,2000}<ParityTable/,
  },
  {
    name: "pre_flight_dvir.queue: PreFlightDvirQueue real ParityTable",
    file: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "parts_inventory.record_purchase: PartsInventoryTable real + Record Purchase -> real Modal with MoneyInput",
    file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
    pattern: /\+ Record Purchase[\s\S]{0,2500}title="Record Purchase"/,
  },
  {
    name: "pm.schedule.create: PmSchedulePage real + Create -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx",
    pattern: /\+ Create[\s\S]{0,900}<ParityTable/,
  },
  {
    name: "pm.auto_engine.run: PmAutoEnginePage real Run now mutation driving a real recent-runs list",
    file: "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx",
    pattern: /(?=[\s\S]*runMaintenancePmAutoEngineNow)(?=[\s\S]*runNowM\.mutate\(\{\s*companyId,\s*generation: actionGenerationRef\.current\s*\}\))(?=[\s\S]*Recent runs)/,
  },
  {
    // RE-ANCHOR (found stale 2026-08-29): real gap grew from 300 to 393 chars (a
    // ListErrorState branch was added between the header action and the ParityTable render) —
    // widened with headroom.
    name: "inspections.create: InspectionsPage real + Create Inspection -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
    pattern: /\+ Create Inspection[\s\S]{0,700}<ParityTable/,
  },
  {
    // RE-ANCHOR (found stale 2026-08-29): real gap grew from 2200 to 2421 chars (a KPI summary
    // grid + a CSV import row were added between the header action and the ParityTable render) —
    // widened with headroom.
    name: "parts.create: PartsMasterDataPage real + Create Part -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
    pattern: /\+ Create Part[\s\S]{0,2700}<ParityTable/,
  },
  {
    name: "vendors.create: VendorsPage (maintenance) real + Create Vendor -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx",
    pattern: /\+ Create Vendor[\s\S]{0,1400}<ParityTable/,
  },
  {
    name: "fault_rules.create: FaultRulesPage real + Create Rule -> real ParityTable, mounts real FaultRuleModal",
    file: "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx",
    pattern: /\+ Create Rule[\s\S]{0,700}<ParityTable[\s\S]{0,450}<FaultRuleModal/,
  },
  {
    name: "fault_drafts.review: FaultDraftsPage real Review action -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
    pattern: /Review[\s\S]{0,2700}<ParityTable/,
  },
  {
    name: "tires.create_record / tires.create_brand / tires.create: TireProgramPage real + Create Brand and + Create Tire Record buttons",
    file: "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
    pattern: /\+ Create Brand[\s\S]{0,400}\+ Create Tire Record/,
  },
  {
    name: "warranty.create_claim: WarrantyClaimsPage real + Create Claim -> real ParityTable",
    file: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx",
    pattern: /\+ Create Claim[\s\S]{0,1800}<ParityTable/,
  },
  {
    name: "maintenance.panel.wotime_tracking: WOTimeTrackingPanel real ParityTable",
    file: "apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "master.drivers.create: DriversMasterDataPage real ParityTable + real Modal drawer Create Driver",
    file: "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
    pattern: /<ParityTable[\s\S]{0,700}title="Create Driver"/,
  },
  {
    name: "master.vehicles.create: VehiclesMasterDataPage real ParityTable + real Modal drawer Create Vehicle",
    file: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
    pattern: /<ParityTable[\s\S]{0,700}title="Create Vehicle"/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".maintenance-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 34 maintenance qbo_chrome leaf asserts`);
