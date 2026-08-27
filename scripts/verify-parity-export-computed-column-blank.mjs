#!/usr/bin/env node
// PARITY-EXPORT-COMPUTED-COLUMN-BLANK — guard
//
// ParityTable.tsx's exportCsv() read `row[key]` directly, never calling the column's `render`.
// Any column whose value only exists through `render` — a computed field with no matching row
// property, or a `_cents` integer formatted for display — exported blank, a raw unit-less
// number, or the literal string "[object Object]" while the on-screen table looked complete:
//  - PropertyTaxRenditionPage.tsx: Rendered Value / Assessed Tax / Cost columns exported raw
//    cents integers under dollar-labeled headers (a 100x magnitude error, no unit).
//  - HosHistorySection.tsx: Duration column (computed purely in render, no matching field)
//    exported blank on every row.
//  - ModuleCompletionPage.tsx: Acceptance items / Open columns (no matching fields) exported
//    blank; Urgent hops (a U14ExclusiveRow OBJECT, not text) exported "[object Object]".
// Fixed by adding an optional `exportValue` to ParityColumn (same precedent as the existing
// `sortValue` extractor) and wiring it on every affected column.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PARITY_TABLE_FILE = "apps/frontend/src/components/parity/ParityTable.tsx";
const PROPERTY_TAX_FILE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";
const HOS_HISTORY_FILE = "apps/frontend/src/pages/compliance/HosHistorySection.tsx";
const MODULE_COMPLETION_FILE = "apps/frontend/src/pages/program/ModuleCompletionPage.tsx";

export function check(files) {
  const failures = [];

  if (!/exportValue\?:\s*\(row: T\) => string \| number \| null \| undefined/.test(files[PARITY_TABLE_FILE])) {
    failures.push(`${PARITY_TABLE_FILE} ParityColumn no longer declares exportValue`);
  }
  if (!/c\.exportValue \? c\.exportValue\(row\) : \(row as Record<string, unknown>\)\[String\(c\.key\)\]/.test(files[PARITY_TABLE_FILE])) {
    failures.push(`${PARITY_TABLE_FILE} exportCsv no longer prefers exportValue over the raw row lookup`);
  }

  const taxExportCount = (files[PROPERTY_TAX_FILE].match(/exportValue: \([rl]\) => centsToUSD\(/g) ?? []).length;
  if (taxExportCount < 4) {
    failures.push(`${PROPERTY_TAX_FILE} expected 4 centsToUSD exportValue wirings, found ${taxExportCount}`);
  }

  if (!/exportValue: \(ev\) => hmm\(durationMinutes\(ev\.started_at, ev\.ended_at\)\)/.test(files[HOS_HISTORY_FILE])) {
    failures.push(`${HOS_HISTORY_FILE} Duration column no longer has exportValue`);
  }

  if (!/exportValue: \(row\) =>\s*\n\s*!row\.u14 \? "—" : row\.u14\.status === "CERTIFIED"/.test(files[MODULE_COMPLETION_FILE])) {
    failures.push(`${MODULE_COMPLETION_FILE} Urgent hops column no longer has exportValue`);
  }
  if (!/exportValue: \(row\) => `\$\{row\.done\}\/\$\{row\.total\}`/.test(files[MODULE_COMPLETION_FILE])) {
    failures.push(`${MODULE_COMPLETION_FILE} Acceptance items column no longer has exportValue`);
  }

  return failures;
}

function readAll() {
  const files = {};
  for (const f of [PARITY_TABLE_FILE, PROPERTY_TAX_FILE, HOS_HISTORY_FILE, MODULE_COMPLETION_FILE]) {
    files[f] = fs.readFileSync(path.join(root, f), "utf8");
  }
  return files;
}

function run() {
  const files = readAll();
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: parity-export-computed-column-blank");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: ParityTable exportValue extractor exists and all 4 affected columns are wired");
}

function selftest() {
  const files = readAll();

  const offenderA = { ...files };
  offenderA[PARITY_TABLE_FILE] = files[PARITY_TABLE_FILE].replace(
    "esc(c.exportValue ? c.exportValue(row) : (row as Record<string, unknown>)[String(c.key)])",
    "esc((row as Record<string, unknown>)[String(c.key)])"
  );
  if (offenderA[PARITY_TABLE_FILE] === files[PARITY_TABLE_FILE]) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA).length === 0) {
    console.error("FAIL(selftest): planted offender (ParityTable exportCsv reverted) was NOT caught");
    process.exit(1);
  }

  const offenderB = { ...files };
  offenderB[MODULE_COMPLETION_FILE] = files[MODULE_COMPLETION_FILE].replace(
    'exportValue: (row) => `${row.done}/${row.total}`,\n      },',
    "},"
  );
  if (offenderB[MODULE_COMPLETION_FILE] === files[MODULE_COMPLETION_FILE]) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (ModuleCompletionPage Acceptance items exportValue removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
