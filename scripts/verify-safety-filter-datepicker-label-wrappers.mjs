#!/usr/bin/env node
/** SAFETY-F6473 — Safety filter/history DatePickers are never wrapped by labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
function inspect(read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")) {
  const errors = [];
  let governed = 0;
  for (const rel of FILES) {
    const source = read(rel);
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
  // In-memory plants on the real sources (old selftest wrote the tracked file; its slate-600 wrapper literal
  // stopped matching after the owner palette sweep).
  const real = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (inspect(real).length) { console.error("verify-safety-filter-datepicker-label-wrappers --selftest FAIL — real sources rejected"); process.exit(1); }
  const rel = FILES[0];
  const plants = [
    ["filter DatePicker wrapped in a label", wrapFirstDatePicker],
    ["governed DatePicker count changes", duplicateFirstDatePicker],
  ];
  for (const [name, plant] of plants) {
    const planted = plant(real(rel));
    if (planted === real(rel)) { console.error(`verify-safety-filter-datepicker-label-wrappers --selftest FAIL — could not plant: ${name}`); process.exit(1); }
    if (inspect((r) => (r === rel ? planted : real(r))).length === 0) { console.error(`verify-safety-filter-datepicker-label-wrappers --selftest FAIL — escaped: ${name}`); process.exit(1); }
  }
  console.log(`verify-safety-filter-datepicker-label-wrappers --selftest PASS — ${plants.length}/${plants.length} in-memory plants reddened the guard`);
}
if (process.argv.includes("--selftest")) selftest(); else run();
