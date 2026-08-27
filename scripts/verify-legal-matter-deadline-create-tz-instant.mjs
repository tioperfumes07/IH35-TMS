#!/usr/bin/env node
// LEGAL-MATTER-DEADLINE-CREATE-WRONG-TZ-INSTANT — guard
//
// LegalMatterDetailPage.tsx's deadline-creation mutation built `new Date(dlAt).toISOString()`
// from the DateTimePicker's zoneless local wall-clock string, which JS interprets in the VIEWER's
// browser timezone — not this company's Central Time (CLAUDE.md §8). A paralegal entering a court
// filing deadline on a non-Central machine would have the stored instant land on the wrong hour,
// or (for a near-midnight entry) the wrong calendar day. Fixed with a new
// businessDate.ts:companyWallClockToIso() primitive that correctly reprojects the wall clock as
// America/Chicago (DST-aware) rather than the browser's zone.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BUSINESS_DATE_FILE = "apps/frontend/src/lib/businessDate.ts";
const DETAIL_FILE = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

export function check(businessDateText, detailText) {
  const failures = [];

  if (!/export function companyWallClockToIso\(localValue: string\): string \{/.test(businessDateText)) {
    failures.push(`${BUSINESS_DATE_FILE} no longer exports companyWallClockToIso`);
  }
  if (!/timeZone:\s*COMPANY_TIME_ZONE/.test(businessDateText.slice(businessDateText.indexOf("companyWallClockToIso")))) {
    failures.push(`${BUSINESS_DATE_FILE} companyWallClockToIso no longer anchors on COMPANY_TIME_ZONE`);
  }

  if (!/import\s*\{\s*companyWallClockToIso\s*\}\s*from\s*"..\/..\/..\/lib\/businessDate"/.test(detailText)) {
    failures.push(`${DETAIL_FILE} no longer imports companyWallClockToIso`);
  }
  const addDlIdx = detailText.indexOf("const addDlMut = useMutation({");
  const addDlBlock = addDlIdx >= 0 ? detailText.slice(addDlIdx, addDlIdx + 700) : "";
  if (!/deadline_at:\s*companyWallClockToIso\(dlAt\)/.test(addDlBlock)) {
    failures.push(`${DETAIL_FILE} addDeadline mutation no longer converts dlAt via companyWallClockToIso`);
  }
  if (/deadline_at:\s*new Date\(dlAt\)\.toISOString\(\)/.test(addDlBlock)) {
    failures.push(`${DETAIL_FILE} addDeadline mutation reverted to the browser-local new Date(dlAt).toISOString() pattern`);
  }

  return failures;
}

function run() {
  const businessDateText = fs.readFileSync(path.join(root, BUSINESS_DATE_FILE), "utf8");
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const failures = check(businessDateText, detailText);
  if (failures.length > 0) {
    console.error("FAIL: legal-matter-deadline-create-tz-instant");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Legal Matter deadline creation converts the wall clock via companyWallClockToIso");
}

function selftest() {
  const businessDateText = fs.readFileSync(path.join(root, BUSINESS_DATE_FILE), "utf8");
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");

  const offender = detailText.replace(
    "deadline_at: companyWallClockToIso(dlAt),",
    "deadline_at: new Date(dlAt).toISOString(),"
  );
  if (offender === detailText) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(businessDateText, offender).length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to new Date().toISOString()) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
