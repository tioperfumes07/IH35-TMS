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
const FILE = "apps/frontend/src/pages/reports/BookingGapReport.tsx";

export function check(text) {
  const failures = [];
  if (/sessionStorage\.getItem\(\s*["']operating_company_id["']\s*\)/.test(text)) {
    failures.push(`${FILE} reads sessionStorage["operating_company_id"] again — that key is never written anywhere in this codebase, so the query would silently stay disabled forever`);
  }
  if (!/useCompanyContext\(\)/.test(text)) {
    failures.push(`${FILE} no longer uses useCompanyContext() to source the operating company id`);
  }
  if (!/selectedCompanyId/.test(text)) {
    failures.push(`${FILE} no longer reads selectedCompanyId from company context`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: booking-gap-report-live-company-context");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: BookingGapReport.tsx sources operating_company_id from the live company context, not a dead sessionStorage key");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    /const \{ selectedCompanyId \} = useCompanyContext\(\);\s*\n\s*const operatingCompanyId = selectedCompanyId \?\? "";/,
    `const [operatingCompanyId] = useState(() => sessionStorage.getItem("operating_company_id") ?? "");`
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to dead sessionStorage read) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
