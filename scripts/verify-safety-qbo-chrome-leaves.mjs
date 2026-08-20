#!/usr/bin/env node
/**
 * Safety qbo_chrome — leaf-specific Built for the remaining 13 leaves (of 17 total) only "claimed"
 * by the broad verify-cursor-vertical-qbo-picker-modules.mjs sweep — same theater-coverage class
 * already found+fixed for insurance/legal/accounting/customers/drivers/vendors/dispatch this
 * session: it verifies generic shared files (ReportsHome, BillsPage, SafetyHome.tsx's mere
 * existence...) and never opens a real safety leaf's own chrome.
 *
 * chrome.toolbar_(search|range|gear) are already real via CLS-FILTER-GEAR-APPLY (safety included).
 * chrome.toolbar_filter is already real via verify-safety-dispatch-qbo-chrome-toolbar-filter.mjs
 * (SafetyLayout mounts the real SafetyDashboardFilter, shipped PR#12032). None of the 4 toolbar
 * leaves are re-claimed here.
 *
 * All 13 leaves route through `tabs/*Tab.tsx` per apps/frontend/src/routes/manifest.tsx (the
 * SAFETY_TABS_CONFIG.ts canonical nav), but most of those Tab files are 1-line re-export shims —
 * same class of indirection already caught this session for ManualJEModal/BookLoadModal/
 * PayRateTemplatesListPage. The real chrome lives in the file each shim delegates to:
 *   - drug_alcohol.list: DrugAlcoholTab.tsx is itself the real, non-shim file — real DatePicker
 *     fields.
 *   - safety_meetings.create: SafetyMeetingsTab shim -> SafetyMeetingsPage.tsx — real "+ Create
 *     Meeting" -> Modal variant="drawer" with a real DatePicker field.
 *   - dot_inspections.list: DOTInspectionsTab.tsx is itself the real, non-shim file — real
 *     "+ Create" -> real ParityTable.
 *   - accidents.create: AccidentsIncidentsTab shim -> AccidentsPage.tsx — real "+ Create Accident"
 *     -> real ParityTable.
 *   - damage_reports.create: DamageReportsTab shim -> DamageReportsPage.tsx (config wrapper) ->
 *     SafetyIncidentsClusterSurface.tsx — the real shared create+list chrome (createLabel button ->
 *     ParityTable).
 *   - cargo_claims.create: CargoClaimsTab shim -> CargoClaimsPage.tsx (config wrapper) ->
 *     CargoClaimIntakeSurface.tsx — the real shared create+list chrome.
 *   - internal_fines.create: InternalFinesTab shim -> InternalFinesPage.tsx — real inline
 *     MoneyInput + DatePicker fine-amount/imposed-date fields.
 *   - external_fines.create: ExternalFinesTab shim -> FinesPage.tsx's real "+ Create Fine" mounts
 *     FineCreateModal.tsx — a real ParityDrawer with real DatePicker + MoneyInput fields.
 *   - escrow_record.list: EscrowRecordTab.tsx is itself the real, non-shim file — real ParityTable.
 *   - permits.list: PermitsTab shim -> Permits.tsx (wraps Form 2290 + the real list) ->
 *     PermitsPage.tsx — the real ParityTable.
 *   - leave_requests.list: DriverSchedulerRequestInboxPage.tsx (mounted at
 *     scheduler/pending-requests) — real ParityTable.
 *   - training_programs.create: TrainingProgramsTab shim -> TrainingProgramsPage.tsx — real
 *     "+ Create Training Program" -> real ParityTable + Modal variant="drawer".
 *   - training_records.create: TrainingRecordsTab shim -> TrainingRecordsPage.tsx — real
 *     "+ Create Record" -> real ParityTable + Modal variant="drawer" with a real DatePicker field.
 *
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^drug_alcohol\\.list$","task":"VERTICAL-QBO-CHROME-safety-drug-alcohol-list","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^safety_meetings\\.create$","task":"VERTICAL-QBO-CHROME-safety-meetings-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^dot_inspections\\.list$","task":"VERTICAL-QBO-CHROME-safety-dot-inspections-list","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^accidents\\.create$","task":"VERTICAL-QBO-CHROME-safety-accidents-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^damage_reports\\.create$","task":"VERTICAL-QBO-CHROME-safety-damage-reports-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^cargo_claims\\.create$","task":"VERTICAL-QBO-CHROME-safety-cargo-claims-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^internal_fines\\.create$","task":"VERTICAL-QBO-CHROME-safety-internal-fines-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^external_fines\\.create$","task":"VERTICAL-QBO-CHROME-safety-external-fines-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^escrow_record\\.list$","task":"VERTICAL-QBO-CHROME-safety-escrow-record-list","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^permits\\.list$","task":"VERTICAL-QBO-CHROME-safety-permits-list","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^leave_requests\\.list$","task":"VERTICAL-QBO-CHROME-safety-leave-requests-list","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^training_programs\\.create$","task":"VERTICAL-QBO-CHROME-safety-training-programs-create","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^training_records\\.create$","task":"VERTICAL-QBO-CHROME-safety-training-records-create","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-safety-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "drug_alcohol.list: DrugAlcoholTab real DatePicker fields",
    file: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    pattern: /DatePicker/,
  },
  {
    name: "safety_meetings.create: SafetyMeetingsPage real + Create Meeting -> Modal drawer + DatePicker",
    file: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    pattern: /\+ Create Meeting[\s\S]{0,3500}<Modal variant="drawer" open=\{createOpen\}[\s\S]{0,700}DatePicker/,
  },
  {
    name: "dot_inspections.list: DOTInspectionsTab real + Create -> real ParityTable",
    file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    pattern: /\+ Create[\s\S]{0,4200}<ParityTable/,
  },
  {
    name: "accidents.create: AccidentsPage real + Create Accident -> real ParityTable",
    file: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
    pattern: /\+ Create Accident[\s\S]{0,800}<ParityTable/,
  },
  {
    name: "damage_reports.create: SafetyIncidentsClusterSurface (real target of the DamageReportsPage config wrapper) real createLabel -> ParityTable",
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    pattern: /\{config\.createLabel\}[\s\S]{0,4200}<ParityTable/,
  },
  {
    name: "cargo_claims.create: CargoClaimIntakeSurface (real target of the CargoClaimsPage config wrapper) real createLabel -> ParityTable",
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    pattern: /\{createLabel\}[\s\S]{0,10200}<ParityTable/,
  },
  {
    name: "internal_fines.create: InternalFinesPage real inline MoneyInput + DatePicker fine fields",
    file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    pattern: /MoneyInput valueDollars=\{form\.amount[\s\S]{0,400}DatePicker value=\{form\.imposed_date\}/,
  },
  {
    name: "external_fines.create: FinesPage's real + Create Fine mounts FineCreateModal, a real ParityDrawer with DatePicker + MoneyInput",
    file: "apps/frontend/src/pages/safety/FinesPage.tsx",
    pattern: /\+ Create Fine[\s\S]{0,4500}<FineCreateModal/,
  },
  {
    name: "external_fines.create (FineCreateModal itself): real ParityDrawer with DatePicker + MoneyInput",
    file: "apps/frontend/src/pages/safety/components/FineCreateModal.tsx",
    pattern: /<ParityDrawer[\s\S]{0,7200}DatePicker[\s\S]{0,400}MoneyInput/,
  },
  {
    name: "escrow_record.list: EscrowRecordTab real ParityTable",
    file: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "permits.list: PermitsPage (real target behind the Permits.tsx / PermitsTab shim chain) real ParityTable",
    file: "apps/frontend/src/pages/safety/PermitsPage.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "leave_requests.list: DriverSchedulerRequestInboxPage real ParityTable",
    file: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "training_programs.create: TrainingProgramsPage real + Create Training Program -> real ParityTable",
    file: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    pattern: /\+ Create Training Program[\s\S]{0,700}<ParityTable/,
  },
  {
    name: "training_records.create: TrainingRecordsPage real + Create Record -> real ParityTable",
    file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
    pattern: /\+ Create Record[\s\S]{0,400}<ParityTable/,
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".safety-qbo-chrome-selftest-"));
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
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 13 safety qbo_chrome leaf asserts`);
