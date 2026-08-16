#!/usr/bin/env node
/**
 * LV-HOME-DRIVER-DAY-SUMMARY-EMPTY-HIDES-TOOLBAR
 *
 * When has_data=false, DriverDaySummaryCard used to replace the entire ParityTable with a
 * plain text empty message — hiding Search/Range/gear/Filter. Fix: always mount ParityTable
 * and put the honest HOS-empty copy in emptyText.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARD = path.join(ROOT, "apps/frontend/src/components/home/DriverDaySummaryCard.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function collectFailures(src) {
  const failures = [];

  if (/has_data\s*===\s*false\s*\?\s*\(/.test(src) || /has_data\s*===\s*false\s*\?\s*</.test(src)) {
    failures.push(
      "DriverDaySummaryCard must not branch on has_data===false to skip ParityTable (hides surface-bar toolbar)"
    );
  }
  if (!/<ParityTable[\s\S]*emptyText=\{/.test(src)) {
    failures.push("DriverDaySummaryCard must always render ParityTable with a dynamic emptyText");
  }
  if (!/No HOS data recorded for drivers on/.test(src)) {
    failures.push("Honest HOS-empty copy must remain in emptyText when has_data is false");
  }
  // Ensure the HOS copy is tied to has_data, not a separate early return
  if (!/has_data\s*===\s*false[\s\S]{0,200}No HOS data recorded/.test(src)) {
    failures.push("emptyText must use has_data===false for the HOS-empty message");
  }
  if (!/filterBar=\{[\s\S]*<CollapsedListFilters/.test(src)) {
    failures.push("DriverDaySummaryCard must mount the governed Filters panel inside ParityTable filterBar");
  }
  for (const action of ["onApply={stagedFilters.apply}", "onReset={stagedFilters.reset}", "onCancel={stagedFilters.cancel}"]) {
    if (!src.includes(action)) failures.push(`Driver day-summary Filters panel must wire ${action}`);
  }
  if (!/rows=\{filteredRows\}/.test(src) || !/activityFilter\s*===\s*"late"/.test(src)) {
    failures.push("Applied driver activity filter must drive the rows rendered by ParityTable");
  }
  return failures;
}

function selftest() {
  const clean = read(CARD);
  const cleanFails = collectFailures(clean);
  if (cleanFails.length) {
    console.error("verify-home-driver-day-summary-toolbar-always --selftest FAILED — clean:\n" + cleanFails.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }

  const plantedSkip = clean.replace(
    /\) : \(\s*<div className="px-2 py-2">/,
    ') : query.data?.has_data === false ? (\n        <div className="px-3 py-3 text-xs text-slate-500">No HOS data recorded for drivers on {formatDisplayDate(date)}.</div>\n      ) : (\n        <div className="px-2 py-2">'
  );
  if (!collectFailures(plantedSkip).length) {
    console.error("verify-home-driver-day-summary-toolbar-always --selftest FAILED — planted has_data skip escaped");
    process.exit(1);
  }

  const plantedNoHos = clean.replace(/No HOS data recorded for drivers on/g, "No rows");
  if (!collectFailures(plantedNoHos).length) {
    console.error("verify-home-driver-day-summary-toolbar-always --selftest FAILED — planted missing HOS copy escaped");
    process.exit(1);
  }

  const plantedNoFilter = clean.replace(/filterBar=\{[\s\S]*?\n\s*\}\n\s*\/>/, "/>" );
  if (!collectFailures(plantedNoFilter).length) {
    console.error("verify-home-driver-day-summary-toolbar-always --selftest FAILED — planted missing Filters panel escaped");
    process.exit(1);
  }

  const plantedNoApply = clean.replace("onApply={stagedFilters.apply}", "onApply={() => {}}");
  if (!collectFailures(plantedNoApply).length) {
    console.error("verify-home-driver-day-summary-toolbar-always --selftest FAILED — planted inert Apply escaped");
    process.exit(1);
  }

  console.log("verify-home-driver-day-summary-toolbar-always --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = collectFailures(read(CARD));
  if (failures.length) {
    console.error("verify-home-driver-day-summary-toolbar-always FAILED —");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-home-driver-day-summary-toolbar-always OK");
}

main();
