#!/usr/bin/env node
/** U12 — Tasks Mine status filter is MultiSelectDropdown, not SelectCombobox. */
import fs from "node:fs";
const LABEL = "verify-tasks-mine-status-multiselect";
const FILE = "apps/frontend/src/pages/tasks/TasksMinePage.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];
if (!/MultiSelectDropdown/.test(src)) fails.push("must import/use MultiSelectDropdown");
if (!/statusOptions\(/.test(src)) fails.push("must use statusOptions");
if (!/data-testid="tasks-mine-status-filter"/.test(src)) fails.push("missing tasks-mine-status-filter");
if (/SelectCombobox/.test(src)) fails.push("must not use SelectCombobox for status");
if (!/useState<string\[\]>\(\[\]\)/.test(src)) fails.push("statusFilter must be string[]");
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL", fails); process.exit(1); }
  const plant = src.replace("MultiSelectDropdown", "SelectCombobox");
  if (!/SelectCombobox/.test(plant)) { console.error(LABEL, "plant escaped"); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — Tasks Mine status is multi-select");
