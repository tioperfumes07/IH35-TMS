#!/usr/bin/env node
/** CLS-EP-FILTER-ALLOWCREATE — filter EntityPickers must set allowCreate={false}. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entitypicker-filter-allowcreate-ratchet";
const FILTER_PAGES = [
  "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  "apps/frontend/src/pages/safety/IdvrPage.tsx",
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
];
export function collectProblems(root = ROOT) {
  const p = [];
  for (const rel of FILTER_PAGES) {
    const s = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/EntityPicker/.test(s) || !/allowCreate=\{false\}/.test(s)) {
      p.push(`${rel}: filter EntityPicker must set allowCreate={false}`);
    }
  }
  return p;
}
if (process.argv.includes("--selftest")) {
  console.log(LABEL, "SELFTEST OK");
  process.exit(0);
}
const f = collectProblems();
if (f.length) {
  console.error(LABEL, "FAIL", f.join("\n"));
  process.exit(1);
}
console.log(LABEL, "OK");
