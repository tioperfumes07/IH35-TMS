#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","load","connectivity","qbo_chrome","reverse_link"],"leaves":["hos.list","safety.modal.hos_violation_create"],"task":"CLASS-F6528-HOS-VIOLATION-CREATE-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["complete HOS form factory", /function emptyHosViolationForm\(\) \{[\s\S]*?driver_id: ""[\s\S]*?violation_type: ""[\s\S]*?occurred_at: defaultOccurredAtIso\(\)[\s\S]*?duration_minutes: ""[\s\S]*?source: "manual_office"[\s\S]*?notes: ""[\s\S]*?related_load_id: ""/.test(input)],
    ["draft reset includes form suggestion and search", /const resetDraft = useCallback\(\(\) => \{\s*setForm\(emptyHosViolationForm\(\)\);\s*setSuggestionPinned\(false\);\s*setViolationTypeSearch\(""\);/.test(input)],
    ["open/company transition resets lifecycle", /lifecycleGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*resetMutation\(\);\s*\}, \[open, operatingCompanyId, resetDraft, resetMutation\]\);/.test(input)],
    ["dismiss resets lifecycle", /const handleClose = useCallback\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*resetMutation\(\);\s*onClose\(\);/.test(input) && input.includes("onClose={handleClose}") && /onClick=\{handleClose\}/.test(input)],
    ["stale success cannot close new context", /onSuccess: \(_created, submissionGeneration\) => \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*onCreated\(\);\s*handleClose\(\);/.test(input) && /mutation\.mutate\(lifecycleGenerationRef\.current\)/.test(input)],
    ["canonical scoped HOS linkage remains", /createHosViolation\(operatingCompanyId, \{[\s\S]*?driver_id:[\s\S]*?dot_violation_type_id:[\s\S]*?related_load_id:/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleLoad = source.replace('related_load_id: "",', 'void related_load_id;');
  const staleCompany = source.replace("[open, operatingCompanyId, resetDraft, resetMutation]", "[open, resetDraft, resetMutation]");
  const staleSuccess = source.replace("if (lifecycleGenerationRef.current !== submissionGeneration) return;", "void submissionGeneration;");
  const checks = [
    failures(staleLoad).includes("complete HOS form factory"),
    failures(staleCompany).includes("open/company transition resets lifecycle"),
    failures(staleSuccess).includes("stale success cannot close new context"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-hos-violation-create-lifecycle selftest PASS — 3/3 stale load/company/request mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-hos-violation-create-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-hos-violation-create-lifecycle PASS — HOS draft is isolated per company/open lifecycle");
