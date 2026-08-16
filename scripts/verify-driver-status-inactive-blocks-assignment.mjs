#!/usr/bin/env node
/**
 * GUARD: LV-INACTIVE-DRIVER-ASSIGNED-AND-DELIVERED-REVENUE-LOAD.
 *
 * assertDriverQualifiedForLoad() (the single shared gate every dispatch/planner/quick-assign/
 * quicksave/book-load/reassign caller uses) must block assignment when mdata.drivers.status reads
 * 'Inactive' or 'Terminated' — NOT only when the deactivated_at/archived_at markers are set. Those
 * markers and status can legitimately disagree (the CHECK constraint only enforces one direction:
 * deactivated_at set -> status must be Inactive/Terminated, never the reverse), so a driver can be
 * status='Inactive' with both markers NULL and still pass the old marker-only gate.
 */
import fs from "node:fs";

const LABEL = "verify-driver-status-inactive-blocks-assignment";
const REL = "apps/backend/src/dispatch/driver-qualification.service.ts";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/status IN \('Inactive', 'Terminated'\)\) AS is_status_inactive/.test(body)) {
    failures.push("SQL must select status IN ('Inactive','Terminated') AS is_status_inactive");
  }
  if (!/if \(dr\.is_status_inactive\) reasons\.push\("driver_status_inactive"\);/.test(body)) {
    failures.push("reasons array must push driver_status_inactive when is_status_inactive is true");
  }
  if (!/"driver_status_inactive"/.test(body.split("export type DriverQualificationReason")[1]?.split(";")[0] ?? "")) {
    failures.push("DriverQualificationReason type must include driver_status_inactive");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["status IN ('Inactive', 'Terminated')) AS is_status_inactive", "true) AS is_status_inactive"],
    ['if (dr.is_status_inactive) reasons.push("driver_status_inactive");', "// removed"],
    ['| "driver_status_inactive"', "// removed from union"],
  ];
  let failed = false;
  for (const [from, to] of mutations) {
    if (!source.includes(from)) {
      console.error(`${LABEL} SELFTEST FAIL — mutation anchor not found: ${JSON.stringify(from)}`);
      failed = true;
      continue;
    }
    const mutated = source.replace(from, to);
    if (mutated === source || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(from)}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — SQL column, reason-push, and type-union mutations all detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — assertDriverQualifiedForLoad blocks on status Inactive/Terminated, not just the deactivated_at/archived_at markers`);
