#!/usr/bin/env node
/** SAFETY-F6473 — Safety filter/history DatePickers are never wrapped by labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
  "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx",
  "apps/frontend/src/pages/safety/IdvrPage.tsx",
  "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx",
];
function hasWrappedDatePicker(source) {
  let depth = 0;
  for (const token of source.matchAll(/<label\b|<\/label>|<DatePicker\b/g)) {
    if (token[0].startsWith("<label")) depth += 1;
    else if (token[0] === "</label>") depth = Math.max(0, depth - 1);
    else if (depth > 0) return true;
  }
  return false;
}
function inspect() {
  const errors = [];
  let governed = 0;
  for (const rel of FILES) {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (hasWrappedDatePicker(source)) errors.push(`${rel}: filter DatePicker remains label-wrapped`);
    const count = (source.match(/<DatePicker\b/g) ?? []).length;
    governed += count;
    const expectedCount = rel.endsWith("DrugAlcoholTab.tsx") ? 3 : 2;
    if (count !== expectedCount) errors.push(`${rel}: expected ${expectedCount} governed DatePickers, found ${count}`);
  }
  if (governed !== 9) errors.push(`expected 9 governed DatePickers, found ${governed}`);
  return errors;
}
function run() { const found = inspect(); if (found.length) { console.error("verify-safety-filter-datepicker-label-wrappers FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); } console.log("verify-safety-filter-datepicker-label-wrappers OK — 9 Safety calendars are outside labels"); }
function selftest() {
  const file = path.join(ROOT, FILES[0]); const original = fs.readFileSync(file, "utf8");
  try { const planted = original.replace('<div className="text-xs text-slate-600">\n            <label htmlFor="drug-alcohol-history-from">From</label>', '<label className="text-xs text-slate-600">\n            <label htmlFor="drug-alcohol-history-from">From</label>').replace('          </div>\n          <div className="text-xs text-slate-600">', '          </label>\n          <div className="text-xs text-slate-600">'); if (planted === original) throw new Error("could not plant wrapper"); fs.writeFileSync(file, planted); const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT }); if (red.status === 0) throw new Error("planted wrapper did not redden"); }
  finally { fs.writeFileSync(file, original); }
  console.log("verify-safety-filter-datepicker-label-wrappers --selftest PASS — planted wrapper reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
