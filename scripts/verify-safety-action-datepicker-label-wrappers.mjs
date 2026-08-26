#!/usr/bin/env node
/** SAFETY-F6474 — Safety creator/action DatePickers are outside wrapping labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
function inspect() {
  const errors = []; let total = 0;
  for (const [rel, expected] of Object.entries(EXPECTED)) {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const count = (source.match(/<DatePicker\b/g) ?? []).length; total += count;
    if (count !== expected) errors.push(`${rel}: expected ${expected} DatePickers, found ${count}`);
    const labels = [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => m[0]);
    if (labels.some((label) => label.includes("<DatePicker"))) errors.push(`${rel}: DatePicker remains label-wrapped`);
  }
  if (total !== 13) errors.push(`expected 13 governed DatePickers, found ${total}`);
  return errors;
}
function run() { const found = inspect(); if (found.length) { console.error("verify-safety-action-datepicker-label-wrappers FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); } console.log("verify-safety-action-datepicker-label-wrappers OK — 13 Safety action calendars are outside labels"); }
function selftest() {
  const rel = Object.keys(EXPECTED)[0]; const file = path.join(ROOT, rel); const original = fs.readFileSync(file, "utf8");
  try { const planted = original.replace('<div className="block text-xs text-slate-600">\n            <label htmlFor="training-record-completed-date">Completed date</label>', '<label className="block text-xs text-slate-600">\n            Completed date').replace('          </div>\n          <div className="block text-xs text-slate-600">', '          </label>\n          <div className="block text-xs text-slate-600">'); if (planted === original) throw new Error("could not plant wrapper"); fs.writeFileSync(file, planted); const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT }); if (red.status === 0) throw new Error("planted wrapper did not redden"); }
  finally { fs.writeFileSync(file, original); }
  console.log("verify-safety-action-datepicker-label-wrappers --selftest PASS — planted wrapper reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
