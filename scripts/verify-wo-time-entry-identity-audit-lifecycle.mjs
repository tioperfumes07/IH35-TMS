#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/labor.routes.ts", "utf8");
const checks = [
  [/if \(!createdEntry\?\.id\) throw new Error\("wo_time_entry_start_returned_no_row"\)/, "start requires inserted identity"],
  [/if \(!createdEntry\?\.id\) throw new Error\("wo_time_entry_manual_create_returned_no_row"\)/, "manual create requires inserted identity"],
  [/"maintenance\.wo_time_entry\.started"/, "start audit"],
  [/"maintenance\.wo_time_entry\.created"/, "manual-create audit"],
  [/"maintenance\.wo_time_entry\.stopped"/, "stop audit"],
  [/"maintenance\.wo_time_entry\.updated"/, "edit audit"],
  [/"maintenance\.wo_time_entry\.archived"/, "archive audit"],
  [/resource_type: "maintenance\.wo_time_entries"/, "canonical audit resource type"],
  [/operating_company_id: body\.data\.operating_company_id/, "body-scoped company audit"],
  [/operating_company_id: query\.data\.operating_company_id/, "query-scoped archive audit"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-wo-time-entry-identity-audit-lifecycle: ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(new RegExp(pattern.source, "g"), "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-wo-time-entry-identity-audit-lifecycle --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-wo-time-entry-identity-audit-lifecycle");
