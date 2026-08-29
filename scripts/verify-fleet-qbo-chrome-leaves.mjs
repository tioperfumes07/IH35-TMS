#!/usr/bin/env node
/**
 * Fleet qbo_chrome — leaf-specific Built for the 17 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(fleet|home|roster|trailer|unit)(\.|$)
 * or similar) — same theater-coverage class already found+fixed for insurance/legal/accounting/
 * customers/drivers/vendors/dispatch/safety this session: it verifies generic shared files
 * (ReportsHome, BillsPage, FleetHomePage.tsx's mere existence...) and never opens a real fleet
 * leaf's own chrome.
 *
 * chrome.toolbar_(search|range|gear) are already real via CLS-FILTER-GEAR-APPLY (fleet included).
 * chrome.toolbar_filter is already real via CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7 (fleet included,
 * both live in verify-collapsed-list-filters-apply.mjs). None of the 4 toolbar leaves are re-claimed
 * here.
 *
 * All 17 leaves below are genuinely built, traced through the real route/component wiring:
 *   - home.roster: FleetTablePage.tsx (mounted by FleetHomePage) — real CollapsedListFilters wrapping
 *     FleetTable.tsx's real roster table.
 *   - home.create_unit / home.create_trailer: FleetHomePage.tsx's real "+ Create Unit"/
 *     "+ Create Trailer" buttons mounting CreateUnitModal/CreateTrailerModal, both real ParityDrawers
 *     with real Combobox fields.
 *   - roster.row.edit_unit / roster.row.edit_trailer: FleetTable.tsx's real per-row Edit column,
 *     opening the real EditVehicleModal / EditTrailerModal.
 *   - unit.profile.identity: VehicleProfilePage.tsx's real IdentityStatusHeader section.
 *   - unit.profile.quick_assign: VehicleProfilePage.tsx mounts the real QuickAssignModal (a real
 *     Modal with a real DriverPickerWithCreate field).
 *   - unit.profile.documents: VehicleProfilePage.tsx mounts the real PhotoGallery component.
 *   - unit.profile.qbo_mapping: VehicleProfilePage.tsx's real "QBO vendor (ownership / lease
 *     entity)" mapping field.
 *   - unit.profile.action_bar: VehicleProfilePage.tsx mounts the real vehicle-profile ActionBar
 *     (Edit/Export PDF/Archive), which itself renders a real "Export PDF" download link.
 *   - unit.edit.identity / unit.edit.documents: EditVehicleModal.tsx's real field-config array with
 *     both an "Identity" and a "Documents" tab.
 *   - trailer.profile.identity: TrailerProfilePage.tsx's real IdentityStatusHeader section (with a
 *     real onChangeStatus entry point into the Status Change modal).
 *   - trailer.profile.documents: TrailerProfilePage.tsx mounts the real DocumentsSection component.
 *   - trailer.profile.action_bar: TrailerProfilePage.tsx mounts the real trailer-profile ActionBar,
 *     which itself renders a real "Export PDF" download link.
 *   - trailer.edit: EditTrailerModal.tsx is a real Modal with a real Combobox field.
 *   - fleet.modal.status_change: components/trailer-profile/StatusChangeModal.tsx is a real Modal
 *     with a real status <select>.
 *
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^home\\.roster$","task":"VERTICAL-QBO-CHROME-fleet-home-roster","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^home\\.create_unit$","task":"VERTICAL-QBO-CHROME-fleet-create-unit","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^home\\.create_trailer$","task":"VERTICAL-QBO-CHROME-fleet-create-trailer","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^roster\\.row\\.edit_unit$","task":"VERTICAL-QBO-CHROME-fleet-roster-edit-unit","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^roster\\.row\\.edit_trailer$","task":"VERTICAL-QBO-CHROME-fleet-roster-edit-trailer","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.profile\\.identity$","task":"VERTICAL-QBO-CHROME-fleet-unit-profile-identity","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.profile\\.quick_assign$","task":"VERTICAL-QBO-CHROME-fleet-unit-quick-assign","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.profile\\.documents$","task":"VERTICAL-QBO-CHROME-fleet-unit-documents","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.profile\\.qbo_mapping$","task":"VERTICAL-QBO-CHROME-fleet-unit-qbo-mapping","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.profile\\.action_bar$","task":"VERTICAL-QBO-CHROME-fleet-unit-action-bar","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.edit\\.identity$","task":"VERTICAL-QBO-CHROME-fleet-unit-edit-identity","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^unit\\.edit\\.documents$","task":"VERTICAL-QBO-CHROME-fleet-unit-edit-documents","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^trailer\\.profile\\.identity$","task":"VERTICAL-QBO-CHROME-fleet-trailer-profile-identity","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^trailer\\.profile\\.documents$","task":"VERTICAL-QBO-CHROME-fleet-trailer-documents","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^trailer\\.profile\\.action_bar$","task":"VERTICAL-QBO-CHROME-fleet-trailer-action-bar","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^trailer\\.edit$","task":"VERTICAL-QBO-CHROME-fleet-trailer-edit","vertical":"column-wave"}
 * @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^fleet\\.modal\\.status_change$","task":"VERTICAL-QBO-CHROME-fleet-status-change","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-fleet-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "home.roster: FleetTablePage real CollapsedListFilters wrapping the roster",
    file: "apps/frontend/src/pages/maintenance/FleetTablePage.tsx",
    pattern: /<CollapsedListFilters/,
  },
  {
    name: "home.create_unit: FleetHomePage real + Create Unit -> CreateUnitModal",
    file: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    pattern: /\+ Create Unit[\s\S]{0,2000}<CreateUnitModal/,
  },
  {
    name: "home.create_trailer: FleetHomePage real + Create Trailer -> CreateTrailerModal",
    file: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    pattern: /\+ Create Trailer[\s\S]{0,2200}<CreateTrailerModal/,
  },
  {
    name: "roster.row.edit_unit / roster.row.edit_trailer: FleetTable real per-row Edit -> EditVehicleModal + EditTrailerModal",
    file: "apps/frontend/src/components/FleetTable.tsx",
    pattern: /w-14 px-2 py-1">Edit<[\s\S]{0,5500}<EditVehicleModal[\s\S]{0,700}<EditTrailerModal/,
  },
  {
    name: "unit.profile.identity: VehicleProfilePage real IdentityStatusHeader section",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /vp-section-1-identity[\s\S]{0,150}IdentityStatusHeader/,
  },
  {
    name: "unit.profile.quick_assign: VehicleProfilePage mounts the real QuickAssignModal",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /<QuickAssignModal/,
  },
  {
    name: "unit.profile.documents: VehicleProfilePage mounts the real PhotoGallery",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /photosSlot=\{[\s\S]{0,50}<PhotoGallery/,
  },
  {
    // FLEET-CHROME-F6086-QBO-CHROME-GUARD-ANCHOR-DRIFT: was anchored from the section header
    // ("QBO mapping") to the field label with a {0,300} cap. The header is now capability-gated
    // ({qboAvailable ? "QBO mapping" : "Asset classification"}) and a real classesQuery.isError
    // ListErrorState block was added between them, widening the real gap to ~390 chars and
    // tripping the cap on a genuine, correct addition. Re-anchored directly from the field label
    // to its own real QboCombobox component (tight, structural, immune to unrelated additions
    // elsewhere in the same card).
    name: "unit.profile.qbo_mapping: VehicleProfilePage real QBO vendor mapping field",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /QBO vendor \(ownership \/ lease entity\)[\s\S]{0,150}<QboCombobox/,
  },
  {
    name: "unit.profile.action_bar: VehicleProfilePage mounts the real ActionBar (Edit/Archive), which itself renders a real Export PDF link",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /<ActionBar[\s\S]{0,400}onArchive=\{handleArchive\}/,
  },
  {
    name: "unit.profile.action_bar (ActionBar itself): real Export PDF download link",
    file: "apps/frontend/src/components/vehicle-profile/ActionBar.tsx",
    pattern: /Export PDF/,
  },
  {
    name: "unit.edit.identity / unit.edit.documents: EditVehicleModal real field-config Identity + Documents tabs",
    file: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
    pattern: /"Identity"[\s\S]{0,300}"Documents"/,
  },
  {
    name: "trailer.profile.identity: TrailerProfilePage real IdentityStatusHeader section",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /tp-section-1-identity[\s\S]{0,150}IdentityStatusHeader/,
  },
  {
    name: "trailer.profile.documents: TrailerProfilePage mounts the real DocumentsSection",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /tp-section-7-documents[\s\S]{0,150}DocumentsSection/,
  },
  {
    name: "trailer.profile.action_bar: TrailerProfilePage mounts the real ActionBar (Edit/Archive)",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /<ActionBar[\s\S]{0,400}onArchive=\{handleArchive\}/,
  },
  {
    name: "trailer.profile.action_bar (ActionBar itself): real Export PDF download link",
    file: "apps/frontend/src/components/trailer-profile/ActionBar.tsx",
    pattern: /Export PDF/,
  },
  {
    // FLEET-CHROME-F6086-QBO-CHROME-GUARD-ANCHOR-DRIFT: was anchored from <Modal open=...> all
    // the way to <Combobox with a {0,2200} cap. Two real ListErrorState blocks (profileQuery +
    // companiesQuery explicit GET-failure UI) were added between them, widening the real gap to
    // ~2455 chars and tripping the cap on a genuine, correct addition. Split into two checks:
    // the Modal itself is present, and the real Combobox sits directly under its own
    // "Leased To Company" field label (tight, structural, immune to unrelated additions
    // elsewhere in the modal body).
    name: "trailer.edit: EditTrailerModal is a real Modal that mounts",
    file: "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
    pattern: /<Modal\s+open=\{open\}\s+title="Edit trailer"\s+onClose=\{resetAndClose\}/,
  },
  {
    name: "trailer.edit: EditTrailerModal's Leased To Company field is a real Combobox",
    file: "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
    pattern: /label="Leased To Company"[\s\S]{0,300}<Combobox/,
  },
  {
    name: "unit.profile.action_bar: Change Status opens StatusChangeModal (not scrollIntoView)",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /onChangeStatus=\{\(\) => \{\s*setStatusModalTarget\(null\);\s*setStatusModalOpen\(true\);/,
  },
  {
    name: "fleet.modal.status_change: unit StatusChangeModal is a real Modal with a filled status SelectCombobox",
    file: "apps/frontend/src/components/vehicle-profile/StatusChangeModal.tsx",
    pattern: /<Modal open=\{open\} title="Change unit status"[\s\S]{0,900}<SelectCombobox/,
  },
  {
    name: "fleet.modal.status_change: trailer StatusChangeModal is a real Modal with a real status select",
    file: "apps/frontend/src/components/trailer-profile/StatusChangeModal.tsx",
    pattern: /<Modal open=\{open\} title="Change trailer status"[\s\S]{0,500}<select/,
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".fleet-qbo-chrome-selftest-"));
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
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 17 fleet qbo_chrome leaf asserts`);
