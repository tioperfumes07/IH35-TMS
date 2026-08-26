#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/confirmGenerationRef = useRef\(0\)/, "missing company generation"],
    [/work-orders\/\$\{input\.workOrderId\}\/transition[\s\S]*operating_company_id: input\.companyId[\s\S]*to_status: "open"/, "confirmation does not use immutable work-order/company input"],
    [/input\.generation !== confirmGenerationRef\.current/, "stale success is not rejected"],
    [/input\.generation === confirmGenerationRef\.current/, "stale error can leak"],
    [/queryKey: \["maintenance", "fault-drafts", input\.companyId\]/, "refresh is not pinned to submitted company"],
    [/confirmGenerationRef\.current \+= 1[\s\S]*confirmMutation\.reset\(\)[\s\S]*setSelectedId\(null\)[\s\S]*\[companyId\]/, "company transition does not reset confirmation and selection state"],
    [/confirmMutation\.mutate\(\{ workOrderId, companyId, generation: confirmGenerationRef\.current \}\)/, "confirm action does not snapshot company and generation"],
    [/onClick=\{\(\) => confirmDraft\(selected\.id\)\}/, "mounted confirmation bypasses the guarded submitter"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.workOrderId", "selected.id"],
    ["input.companyId", "companyId"],
    ["input.generation !== confirmGenerationRef.current", "false"],
    ["input.generation === confirmGenerationRef.current", "true"],
    ["confirmMutation.reset();", "// planted: state survives"],
    ["confirmMutation.reset();\n    setSelectedId(null);", "confirmMutation.reset();\n    // planted: selection survives"],
    ["companyId, generation: confirmGenerationRef.current", "companyId: '', generation: 0"],
    ["confirmDraft(selected.id)", "confirmMutation.mutate(selected.id)"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-fault-draft-confirm-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-fault-draft-confirm-lifecycle PASS — confirmation remains company-local");
