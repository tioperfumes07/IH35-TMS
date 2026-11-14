#!/usr/bin/env node
/**
 * verify-reports-misc-leaf-back-ret — ROUND 8.20 board25.
 * Remaining misc report leaves Back resolveBackHref.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-reports-misc-leaf-back-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/reports/DuplicateMastersReport.tsx",
  "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx",
  "apps/frontend/src/pages/reports/ReeferFuelCreditReportPage.tsx",
  "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
  "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  "apps/frontend/src/pages/reports/CustomReportBuilder.tsx",
  "apps/frontend/src/pages/reports/SubscriptionManager.tsx",
  "apps/frontend/src/pages/reports/PostedWhileTourOpenReportPage.tsx",
  "apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx",
];

export function check(src, file) {
  const f = [];
  if (!src) return [`${file} missing`];
  if (!/resolveBackHref/.test(src)) f.push(`${file}: must use resolveBackHref`);
  if (!/backHref=\{reportsBackHref\}/.test(src)) f.push(`${file}: backHref must be reportsBackHref`);
  if (/backHref="\/reports"/.test(src)) f.push(`${file}: still hardcodes backHref=/reports`);
  return f;
}

function selftest() {
  let pass = 0;
  const total = PAGES.length + 1;
  for (const file of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (check(src, file).length === 0) pass += 1;
    else console.error(`${LABEL} --selftest: live ${file} fails`, check(src, file));
  }
  const bare = fs.readFileSync(path.join(ROOT, PAGES[0]), "utf8").replace(
    /backHref=\{reportsBackHref\}/,
    'backHref="/reports"',
  );
  if (check(bare, PAGES[0]).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch bare`);
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = [];
  for (const file of PAGES) {
    const src = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : "";
    f.push(...check(src, file));
  }
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — misc report leaf Backs resolve ret`);
}
