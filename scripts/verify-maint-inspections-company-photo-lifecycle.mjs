#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet","safety","docs"],"cols":["unit","connectivity","reverse_link"],"leaves":["inspections.create","inspections.edit","inspections.archive","unit.profile.maintenance"],"task":"MAINT-F6610-INSPECTIONS-COMPANY-PHOTO-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/type InspectionActionScope = \{[\s\S]*companyId: string;[\s\S]*generation: number;[\s\S]*draft: InspectionDraft;[\s\S]*photoFile: File \| null;/, "shared inspection scope is explicit"],
  [/const actionGenerationRef = useRef\(0\)/, "action generation exists"],
  [/const buildPayload = \(submittedDraft: InspectionDraft, submittedCompanyId: string\)[\s\S]*operating_company_id: submittedCompanyId,[\s\S]*unit_id: submittedDraft\.unit_id/, "payload uses submitted company and unit"],
  [/uploadInspectionPhoto\(input\.photoFile, input\.draft\.unit_id, input\.companyId\)[\s\S]*operating_company_id: input\.companyId/, "create photo stays linked to submitted company and unit"],
  [/uploadInspectionPhoto\(input\.photoFile, input\.draft\.unit_id \|\| input\.existingUnitId, input\.companyId\)[\s\S]*attachMaintenanceInspectionPhoto\(input\.inspectionId,[\s\S]*operating_company_id: input\.companyId/, "update photo stays linked to submitted inspection company and unit"],
  [/(?:if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*?refresh\(input\.companyId\)[\s\S]*?){3}/, "all three successes reject stale scope and exact-refresh"],
  [/useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*createMutation\.reset\(\);\s*updateMutation\.reset\(\);\s*archiveMutation\.reset\(\);[\s\S]*setPhotoFile\(null\);\s*\}, \[companyId\]\)/, "company switch retires actions and clears drawer draft"],
  [/archiveMutation\.mutate\(\{\s*inspectionId: String\(row\.id\),\s*companyId,\s*generation: actionGenerationRef\.current,\s*\}\)/, "archive click snapshots company and inspection"],
  [/const input: InspectionActionScope = \{\s*companyId,\s*generation: actionGenerationRef\.current,\s*draft: \{ \.\.\.draft \},\s*photoFile,\s*\}/, "creator submit snapshots company draft and photo"],
  [/updateMutation\.mutate\(\{\s*\.\.\.input,\s*inspectionId: String\(editing\.id\),\s*existingUnitId: String\(editing\.unit_id \?\? ""\),\s*\}\)/, "update submit snapshots record and fallback unit"],
];
const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maint-inspections-company-photo-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maint-inspections-company-photo-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-inspections-company-photo-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}
console.log(`verify-maint-inspections-company-photo-lifecycle PASS — ${checks.length} immutable inspection/photo invariants`);
