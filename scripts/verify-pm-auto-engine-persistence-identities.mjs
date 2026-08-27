#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/pm-auto-engine.service.ts", "utf8");
const checks = [
  [/if \(!\(await relationExists\(client, "maintenance\.work_orders"\)\)\) return null/, "schema-unavailable WO path stays intentional"],
  [/const createdWorkOrder = woRes\.rows\[0\]/, "capture attempted WO insert"],
  [/if \(!createdWorkOrder\?\.id\) throw new Error\("pm_auto_work_order_insert_returned_no_row"\)/, "empty WO INSERT fails loud"],
  [/return createdWorkOrder\.id/, "return proven WO identity"],
  [/const createdRun = runRes\.rows\[0\]/, "capture attempted run insert"],
  [/if \(!createdRun\?\.id\) throw new Error\("pm_auto_run_insert_returned_no_row"\)/, "empty run INSERT fails loud"],
  [/runId = createdRun\.id/, "all logs and finalization use proven run identity"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}
const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-pm-auto-engine-persistence-identities: ${missing.join("; ")}`);
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
  console.log(`PASS verify-pm-auto-engine-persistence-identities --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-pm-auto-engine-persistence-identities");
