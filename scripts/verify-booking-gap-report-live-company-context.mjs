#!/usr/bin/env node
// BOOKING-GAP-REPORT-NEVER-FETCHES-DEAD-QUERY — guard
//
// BookingGapReport.tsx used to read `sessionStorage.getItem("operating_company_id")` — a key
// nothing in this codebase has ever written (a repo-wide grep for a matching setItem returns zero
// hits) — so operatingCompanyId was always "" and its query stayed permanently
// `enabled: false`. Every sibling report page instead sources the entity id from the reactive
// useCompanyContext() company-switcher. This guard fails if the dead sessionStorage read
// reappears, or if the live useCompanyContext() wiring disappears.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILES = [
  "apps/frontend/src/pages/reports/BookingGapReport.tsx",
  "apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx",
  "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
];

export function check(text, file = FILES[0]) {
  const failures = [];
  if (/sessionStorage\.getItem\(\s*["']operating_company_id["']\s*\)/.test(text)) {
    failures.push(`${file} reads sessionStorage["operating_company_id"] again — that key is never written anywhere in this codebase, so the query would silently stay disabled forever`);
  }
  if (!/useCompanyContext\(\)/.test(text)) {
    failures.push(`${file} no longer uses useCompanyContext() to source the operating company id`);
  }
  if (!/selectedCompanyId/.test(text)) {
    failures.push(`${file} no longer reads selectedCompanyId from company context`);
  }
  return failures;
}

function run() {
  const failures = FILES.flatMap((file) => check(fs.readFileSync(path.join(root, file), "utf8"), file));
  if (failures.length > 0) {
    console.error("FAIL: booking-gap-report-live-company-context");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: ${FILES.length} entity-scoped pages source operating_company_id from live company context, never the dead sessionStorage key`);
}

function selftest() {
  for (const file of FILES) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const offender = text.replace(
      /const \{ selectedCompanyId \} = useCompanyContext\(\);\s*\n\s*const operatingCompanyId = selectedCompanyId \?\? "";/,
      `const [operatingCompanyId] = useState(() => sessionStorage.getItem("operating_company_id") ?? "");`
    );
    if (offender === text) {
      console.error(`FAIL(selftest): offender mutation did not change ${file} — pattern out of sync`);
      process.exit(1);
    }
    if (check(offender, file).length === 0) {
      console.error(`FAIL(selftest): planted dead-sessionStorage offender escaped in ${file}`);
      process.exit(1);
    }
  }
  console.log(`PASS(selftest): planted regression caught in ${FILES.length}/${FILES.length} governed pages; baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
