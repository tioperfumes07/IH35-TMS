#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/DefectDetailPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing defect/company generation"],
    [/triageMaintenanceDvirDefect\(input\.defectId,[\s\S]*operating_company_id: input\.companyId[\s\S]*action: input\.action[\s\S]*mechanic_notes: input\.mechanicNotes/, "triage does not use immutable defect/company/action/notes"],
    [/input\.generation !== actionGenerationRef\.current/, "stale triage success is not rejected"],
    [/input\.generation === actionGenerationRef\.current/, "stale triage error can leak"],
    [/queryKey: \["maintenance", "dvir-defect", input\.companyId, input\.defectId\]/, "detail refresh is not pinned to submitted scope"],
    [/queryKey: \["maintenance", "dvir-defects", input\.companyId\]/, "inbox refresh is not pinned to submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*triageMut\.reset\(\)[\s\S]*setMechanicNotes\(""\)[\s\S]*setWoModalOpen\(false\)[\s\S]*\[operatingCompanyId, defectId\]/, "scope transition does not reset action/draft/drawer state"],
    [/generation: actionGenerationRef\.current[\s\S]*mechanicNotes: mechanicNotes\.trim\(\) \|\| undefined/, "triage caller does not snapshot generation and notes"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.defectId", "defectId"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["triageMut.reset();", "// planted: action survives"],
    ['setMechanicNotes("");', "// planted: notes survive"],
    ["generation: actionGenerationRef.current", "generation: 0"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-defect-detail-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-defect-detail-action-lifecycle PASS — DVIR triage actions remain defect/company-local");
