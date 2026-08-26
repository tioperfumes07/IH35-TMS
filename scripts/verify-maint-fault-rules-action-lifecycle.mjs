#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/fault-rules\/\$\{input\.values\.id\}[\s\S]*body: \{ \.\.\.input\.values, operating_company_id: input\.companyId \}[\s\S]*body: \{ \.\.\.input\.values, operating_company_id: input\.companyId \}/, "save does not use immutable values/company"],
    [/fault-rules\/\$\{input\.id\}\/archive[\s\S]*operating_company_id: input\.companyId/, "archive does not use immutable rule/company"],
    [(value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale successes must be rejected"],
    [(value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale errors must be rejected"],
    [(value.match(/queryKey: \["maintenance", "fault-rules", input\.companyId\]/g) ?? []).length === 2 ? /./ : /$a/, "both refreshes must target submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*saveMutation\.reset\(\)[\s\S]*archiveMutation\.reset\(\)[\s\S]*setModalOpen\(false\)[\s\S]*setEditRule\(null\)[\s\S]*\[companyId\]/, "company transition does not reset actions and modal state"],
    [/values: \{ \.\.\.values \}, companyId, generation: actionGenerationRef\.current/, "save caller does not snapshot values/company/generation"],
    [/archiveMutation\.mutate\(\{ id, companyId, generation: actionGenerationRef\.current \}\)/, "archive caller does not snapshot rule/company/generation"],
    [/onClick=\{\(\) => archiveRule\(row\.id\)\}[\s\S]*onSave=\{saveRule\}/, "mounted save/archive bypass guarded submitters"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["fault-rules/${input.values.id}", "fault-rules/${editRule?.id}"],
    ["...input.values, operating_company_id: input.companyId", "...input.values, operating_company_id: companyId"],
    ["input.id}/archive", "id}/archive"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["archiveMutation.reset();", "// planted: archive state survives"],
    ["setModalOpen(false);\n    setEditRule(null);", "// planted: modal survives"],
    ["values: { ...values }, companyId, generation: actionGenerationRef.current", "values, companyId: '', generation: 0"],
    ["archiveRule(row.id)", "archiveMutation.mutate(row.id)"],
    ["onSave={saveRule}", "onSave={(values) => saveMutation.mutate(values)}"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-fault-rules-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-fault-rules-action-lifecycle PASS — save/archive remain company-local");
