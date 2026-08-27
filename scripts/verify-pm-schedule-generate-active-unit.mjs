#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/pm-schedule.routes.ts";
const original = fs.readFileSync(path, "utf8");

const checks = [
  [/app\.post\("\/api\/v1\/maintenance\/pm-schedule", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/, "create rate limit"],
  [/app\.post\("\/api\/v1\/maintenance\/pm-schedule\/:id\/generate-wo", \{ config: \{ rateLimit: \{ max: 30, timeWindow: "1 minute" \} \} \}/, "generate rate limit"],
  [/INNER JOIN mdata\.units pm_schedule_unit/, "canonical unit join"],
  [/pm_schedule_unit\.id = pm_schedule\.unit_id/, "schedule unit FK"],
  [/COALESCE\(pm_schedule_unit\.currently_leased_to_company_id, pm_schedule_unit\.owner_company_id\) = pm_schedule\.operating_company_id/, "current operator scope"],
  [/pm_schedule_unit\.deactivated_at IS NULL/, "active unit lifecycle"],
  [/pm_schedule\.operating_company_id = \$2::uuid/, "selected company scope"],
  [/pm_schedule\.is_active = true/, "active schedule lifecycle"],
  [/pm_work_order_create_returned_no_row/, "empty WO insert fails loud"],
];

function failures(source) {
  return checks.filter(([pattern]) => !pattern.test(source)).map(([, label]) => label);
}

const missing = failures(original);
if (missing.length) {
  console.error(`FAIL verify-pm-schedule-generate-active-unit: ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = original.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-pm-schedule-generate-active-unit --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}

console.log("PASS verify-pm-schedule-generate-active-unit");
