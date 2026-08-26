#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["unit","work_order","connectivity","reverse_link"],"leaves":["pm.schedule.create","pm.schedule.generate_wo","unit.profile.maintenance"],"task":"MAINT-F6609-PM-SCHEDULE-COMPANY-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const actionGenerationRef = useRef\(0\)/, "action generation exists"],
  [/mutationFn: \(\{ generation: _generation, \.\.\.body \}: \{[\s\S]*operating_company_id: string;[\s\S]*unit_id: string;[\s\S]*generation: number;[\s\S]*\}\) => createMaintenancePmSchedule\(body\)/, "create strips generation and submits immutable body"],
  [/onSuccess: async \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*input\.operating_company_id/, "create rejects stale success and refreshes submitted company"],
  [/onError: \(err: unknown, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*Failed to create PM schedule/, "create rejects stale failure"],
  [/mutationFn: \(input: \{ id: string; companyId: string; generation: number \}\) =>\s*generateMaintenancePmWorkOrder\(input\.id, input\.companyId\)/, "generate submits schedule and company snapshot"],
  [/onSuccess: async \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*input\.companyId/, "generate rejects stale success and refreshes submitted company"],
  [/useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*createM\.reset\(\);\s*generateM\.reset\(\);[\s\S]*\}, \[companyId\]\)/, "company switch retires both actions and clears creator"],
  [/generateM\.mutate\(\{\s*id: row\.id,\s*companyId,\s*generation: actionGenerationRef\.current,\s*\}\)/, "Generate WO click snapshots scope"],
  [/createM\.mutate\(\{[\s\S]*operating_company_id: companyId,[\s\S]*unit_id: unitId,[\s\S]*generation: actionGenerationRef\.current,[\s\S]*\}\)/, "create submit snapshots company unit and generation"],
];
const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maint-pm-schedule-company-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maint-pm-schedule-company-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-pm-schedule-company-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}
console.log(`verify-maint-pm-schedule-company-lifecycle PASS — ${checks.length} immutable schedule invariants`);
