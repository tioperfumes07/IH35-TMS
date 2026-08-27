#!/usr/bin/env node
// LEGAL-TEMPLATES-BACK-TO-HOME — guard
//
// LegalTemplatesListPage.tsx renders LegalModuleTabs (a sibling tab of Contracts/Policies/
// Attorney Review/Matters/Reports, not the Legal module root — /legal is), but its
// BackArrowHeader had `backTo="/home"`. On a direct load/refresh (no in-app history for the
// smart-back fallback to use), "← Back" dropped the user out of the Legal module entirely
// instead of back to its hub. Every other one-level-below-module-root page in this codebase
// points backTo at its own module hub (e.g. every /lists/** catalog list page uses
// backTo="/lists"; LegalTemplateDetailPage.tsx correctly uses backTo="/legal/templates" for its
// own parent) — this was the one outlier.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PAGE_FILE = "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("<BackArrowHeader");
  const block = idx >= 0 ? text.slice(idx, idx + 600) : "";
  if (!/backTo="\/legal"/.test(block)) {
    failures.push(`${PAGE_FILE} BackArrowHeader no longer points backTo="/legal"`);
  }
  if (/backTo="\/home"/.test(block)) {
    failures.push(`${PAGE_FILE} BackArrowHeader reverted to backTo="/home"`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: legal-templates-back-to-legal-hub");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Legal Templates back button points to /legal, not /home");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const offender = text.replace('backTo="/legal"', 'backTo="/home"');
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to /home) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
