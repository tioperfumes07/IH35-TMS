#!/usr/bin/env node
/** SAFETY-F6474 — Safety creator/action DatePickers are outside wrapping labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = {
  "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx": 2,
  "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx": 1,
  "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx": 1,
  "apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx": 1,
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx": 2,
  "apps/frontend/src/pages/safety/PermitsPage.tsx": 1,
  "apps/frontend/src/pages/safety/components/FineLifecycleActions.tsx": 1,
  "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx": 4,
};
function inspect(read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")) {
  const errors = []; let total = 0;
  for (const [rel, expected] of Object.entries(EXPECTED)) {
    const source = read(rel);
    const count = (source.match(/<DatePicker\b/g) ?? []).length; total += count;
    if (count !== expected) errors.push(`${rel}: expected ${expected} DatePickers, found ${count}`);
    const labels = [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => m[0]);
    if (labels.some((label) => label.includes("<DatePicker"))) errors.push(`${rel}: DatePicker remains label-wrapped`);
  }
  if (total !== 13) errors.push(`expected 13 governed DatePickers, found ${total}`);
  return errors;
}
function run() { const found = inspect(); if (found.length) { console.error("verify-safety-action-datepicker-label-wrappers FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); } console.log("verify-safety-action-datepicker-label-wrappers OK — 13 Safety action calendars are outside labels"); }
/** In-memory plants (never writes tracked source): wrap the FIRST real <DatePicker …/> in a <label>, and duplicate one. */
function wrapFirstDatePicker(src) {
  const at = src.indexOf("<DatePicker");
  const end = at < 0 ? -1 : src.indexOf("/>", at);
  return at < 0 || end < 0 ? src : `${src.slice(0, at)}<label>${src.slice(at, end + 2)}</label>${src.slice(end + 2)}`;
}
function duplicateFirstDatePicker(src) {
  const at = src.indexOf("<DatePicker");
  const end = at < 0 ? -1 : src.indexOf("/>", at);
  return at < 0 || end < 0 ? src : `${src.slice(0, end + 2)}${src.slice(at, end + 2)}${src.slice(end + 2)}`;
}
function selftest() {
  // Plants are applied in memory to the real sources (the old selftest wrote the tracked file and its literal
  // slate-600 wrapper no longer existed after the owner palette sweep, so it could not plant at all).
  const real = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (inspect(real).length) { console.error("verify-safety-action-datepicker-label-wrappers --selftest FAIL — real sources rejected"); process.exit(1); }
  const rel = Object.keys(EXPECTED)[0];
  const plants = [
    ["DatePicker wrapped in a label", wrapFirstDatePicker],
    ["governed DatePicker count changes", duplicateFirstDatePicker],
  ];
  for (const [name, plant] of plants) {
    const planted = plant(real(rel));
    if (planted === real(rel)) { console.error(`verify-safety-action-datepicker-label-wrappers --selftest FAIL — could not plant: ${name}`); process.exit(1); }
    if (inspect((r) => (r === rel ? planted : real(r))).length === 0) { console.error(`verify-safety-action-datepicker-label-wrappers --selftest FAIL — escaped: ${name}`); process.exit(1); }
  }
  console.log(`verify-safety-action-datepicker-label-wrappers --selftest PASS — ${plants.length}/${plants.length} in-memory plants reddened the guard`);
}
if (process.argv.includes("--selftest")) selftest(); else run();
