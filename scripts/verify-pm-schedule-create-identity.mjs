#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/pm-schedule.routes.ts", "utf8");

const checks = [
  [/const createdSchedule = res\.rows\[0\]/, "capture canonical inserted schedule"],
  [/if \(!createdSchedule\?\.id\) throw new Error\("pm_schedule_create_returned_no_row"\)/, "empty INSERT must fail loud"],
  [/resource_id: createdSchedule\.id/, "audit must use proven schedule identity"],
  [/return createdSchedule/, "HTTP 201 path must return proven schedule"],
  [/if \(!unit\.rows\[0\]\) return null/, "invalid unit must retain distinct validation path"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-pm-schedule-create-identity: ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-pm-schedule-create-identity --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}

console.log("PASS verify-pm-schedule-create-identity");
