#!/usr/bin/env node
/**
 * Regression guard: the Compliance "HOS Viewer" tab must render a real driver PICKER,
 * never a dead-end empty prompt with no control.
 * Root cause it locks: ComplianceDashboardPage once rendered a hardcoded
 * <ComplianceEmptyState title="HOS Viewer" message="Select a driver…"/> with zero picker controls.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];
const read = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return ""; }
  return fs.readFileSync(abs, "utf8");
};

const PAGE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";
const VIEWER = "apps/frontend/src/pages/compliance/HosViewerSection.tsx";

const page = read(PAGE);
if (page) {
  if (!/HosViewerSection/.test(page)) failures.push(`${PAGE}: hos_viewer tab must render <HosViewerSection/>`);
  // The dead-end empty prompt must be gone for the HOS Viewer tab.
  if (/title="HOS Viewer"\s+message="Select a driver/.test(page)) {
    failures.push(`${PAGE}: HOS Viewer must NOT be a hardcoded "Select a driver" empty-state (dead end).`);
  }
}

const viewer = read(VIEWER);
if (viewer) {
  if (!/Combobox/.test(viewer)) failures.push(`${VIEWER}: must use the shared Combobox picker.`);
  if (!/listDrivers/.test(viewer)) failures.push(`${VIEWER}: must source selectable drivers from listDrivers (active roster).`);
  if (!/getHosDaily\b/.test(viewer)) failures.push(`${VIEWER}: must load the per-driver daily ELD log via getHosDaily.`);
  // Roster/daily reads must always pass the date param (the roster 400s without it).
  if (!/selectedDate/.test(viewer)) failures.push(`${VIEWER}: must carry a selectable date and pass it to the HOS reads.`);
}

if (failures.length) {
  console.error("verify:hos-viewer-picker FAIL:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("verify:hos-viewer-picker OK");
