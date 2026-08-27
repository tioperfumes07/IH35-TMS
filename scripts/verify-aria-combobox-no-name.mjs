#!/usr/bin/env node
// ARIA-COMBOBOX-NO-NAME — guard
//
// The shared Combobox component (backs EntityPicker, which backs every FK/reference/filter
// picker app-wide) had NO mechanism to receive an accessible name at all — no `aria-label` prop
// existed on ComboboxProps, so a call site with no wrapping <label> (a compact filter toolbar,
// e.g. Legal Matters' unit filter, Fleet HOS Board's unit filter, both on module hub pages) left
// the input's only "name" as its `placeholder`, which is not one — same defect class as the
// already-fixed DriversReferenceCatalogPage search-input bug. Also found: ParityTable's page-jump
// input (backs 33+ list pages), Legal Templates' Category filter, and 3 filter inputs on
// ProgramBoardPage — all bare placeholder-only text inputs with no aria-label/label anywhere.
//
// Fix: added an `ariaLabel` prop to Combobox + forwarded through EntityPicker (additive — a call
// site already wrapped in a real <label>, like HosTrackerSection's Driver picker, needs neither),
// wired it at the two confirmed EntityPicker filter sites, and added aria-label directly to the
// four bare <input> sites.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const COMBOBOX_FILE = "apps/frontend/src/components/Combobox.tsx";
const ENTITY_PICKER_FILE = "apps/frontend/src/components/parity/EntityPicker.tsx";
const LEGAL_MATTERS_FILE = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";
const FLEET_HOS_FILE = "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx";
const PARITY_TABLE_FILE = "apps/frontend/src/components/parity/ParityTable.tsx";
const LEGAL_TEMPLATES_FILE = "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx";
const PROGRAM_BOARD_FILE = "apps/frontend/src/pages/program/ProgramBoardPage.tsx";

export function check(files) {
  const failures = [];

  if (!/ariaLabel\?:\s*string/.test(files[COMBOBOX_FILE])) {
    failures.push(`${COMBOBOX_FILE} ComboboxProps no longer declares ariaLabel`);
  }
  if (!/aria-label=\{ariaLabel\}/.test(files[COMBOBOX_FILE])) {
    failures.push(`${COMBOBOX_FILE} input no longer applies aria-label={ariaLabel}`);
  }

  if (!/ariaLabel\?:\s*string/.test(files[ENTITY_PICKER_FILE])) {
    failures.push(`${ENTITY_PICKER_FILE} EntityPickerProps no longer declares ariaLabel`);
  }
  if (!/ariaLabel=\{ariaLabel\}/.test(files[ENTITY_PICKER_FILE])) {
    failures.push(`${ENTITY_PICKER_FILE} no longer forwards ariaLabel to Combobox`);
  }

  if (!/ariaLabel="Filter by unit"/.test(files[LEGAL_MATTERS_FILE])) {
    failures.push(`${LEGAL_MATTERS_FILE} unit filter EntityPicker no longer has ariaLabel`);
  }
  if (!/ariaLabel="Filter by unit"/.test(files[FLEET_HOS_FILE])) {
    failures.push(`${FLEET_HOS_FILE} unit filter EntityPicker no longer has ariaLabel`);
  }
  if (!/aria-label="Jump to page"/.test(files[PARITY_TABLE_FILE])) {
    failures.push(`${PARITY_TABLE_FILE} page-jump input no longer has aria-label`);
  }
  if (!/aria-label="Filter by category"/.test(files[LEGAL_TEMPLATES_FILE])) {
    failures.push(`${LEGAL_TEMPLATES_FILE} Category filter input no longer has aria-label`);
  }
  const programBoardLabels = [
    'aria-label="Filter board rows"',
    'aria-label="Filter merged PRs"',
    'aria-label="Filter held PRs"',
  ];
  for (const label of programBoardLabels) {
    if (!files[PROGRAM_BOARD_FILE].includes(label)) {
      failures.push(`${PROGRAM_BOARD_FILE} missing ${label}`);
    }
  }

  return failures;
}

function readAll() {
  const files = {};
  for (const f of [
    COMBOBOX_FILE,
    ENTITY_PICKER_FILE,
    LEGAL_MATTERS_FILE,
    FLEET_HOS_FILE,
    PARITY_TABLE_FILE,
    LEGAL_TEMPLATES_FILE,
    PROGRAM_BOARD_FILE,
  ]) {
    files[f] = fs.readFileSync(path.join(root, f), "utf8");
  }
  return files;
}

function run() {
  const files = readAll();
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: aria-combobox-no-name");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Combobox/EntityPicker ariaLabel plumbing + 6 confirmed unlabeled-filter call sites all wired");
}

function selftest() {
  const files = readAll();

  const offenderA = { ...files };
  offenderA[LEGAL_MATTERS_FILE] = files[LEGAL_MATTERS_FILE].replace(
    '\n                    ariaLabel="Filter by unit"',
    ""
  );
  if (offenderA[LEGAL_MATTERS_FILE] === files[LEGAL_MATTERS_FILE]) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA).length === 0) {
    console.error("FAIL(selftest): planted offender (LegalMattersListPage ariaLabel removed) was NOT caught");
    process.exit(1);
  }

  const offenderB = { ...files };
  offenderB[PARITY_TABLE_FILE] = files[PARITY_TABLE_FILE].replace(
    '\n              aria-label="Jump to page"',
    ""
  );
  if (offenderB[PARITY_TABLE_FILE] === files[PARITY_TABLE_FILE]) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (ParityTable aria-label removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
