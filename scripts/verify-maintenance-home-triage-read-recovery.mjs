#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","unit","load","reverse_link"],"leaves":["home.rm_status_board"],"task":"MAINT-F7016-HOME-TRIAGE-READ-RECOVERY","vertical":"class-sweep"} */

import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8");
const checks = [
  [/useEffect\(\(\) => \{\s*if \(triageQuery\.isError\) setTriageIssue\(null\);\s*\}, \[triageQuery\.isError\]\);/, "failed sidebar read retires retained triage target"],
  [/\{triageQuery\.isError \? \([\s\S]*title="Couldn't load in-transit triage queue"[\s\S]*onRetry=\{\(\) => void triageQuery\.refetch\(\)\}[\s\S]*\) : \([\s\S]*<InTransitTriageBand[\s\S]*issues=\{triageQuery\.data\?\.issues \?\? \[\]\}[\s\S]*onTriage=\{\(issue\) => setTriageIssue\(issue\)\}/, "sidebar replaces retained queue/actions with exact retry"],
  [/totalCount=\{triageQuery\.data\?\.total_count \?\? triageQuery\.data\?\.issues\?\.length \?\? 0\}/, "successful sidebar preserves exact total"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maintenance-home-triage-read-recovery FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-home-triage-read-recovery SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-home-triage-read-recovery SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-home-triage-read-recovery PASS — ${checks.length} sidebar triage invariants`);
