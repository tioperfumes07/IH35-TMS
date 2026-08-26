#!/usr/bin/env node
/** @matrix-built {"modules":["safety","drivers","fleet"],"cols":["connectivity","reverse_link"],"leaves":["company_violations.list","profiles.detail","unit.profile.safety"],"task":"SAF-F6512-COMPANY-VIOLATION-CREATOR-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx";
const source = fs.readFileSync(file, "utf8");
const RESETTERS = [
  'setViolationType("DOT_inspection")',
  'setSeverity("minor")',
  "setReportedDate(companyToday())",
  'setDescription("")',
  'setCorrectivePlan("")',
  "setViolationTypeUuid(null)",
  "setRelatedDriverId(null)",
  "setRelatedUnitId(null)",
  'setTypeSearch("")',
];

function failures(input = source) {
  const body = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["complete violation draft reset", RESETTERS.every((token) => body.includes(token))],
    ["reset draft and mutation on open/company change", /if \(!open\) return;\s*resetDraft\(\);\s*resetMutation\(\);\s*\}, \[open, operatingCompanyId, resetDraft, resetMutation\]\);/.test(input)],
    ["actual close retires request and resets", /const handleClose = useCallback\(\(\) => \{\s*if \(mutation\.isPending\) return;\s*companyGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*resetMutation\(\);\s*onClose\(\);/.test(input)],
    ["dirty drawer confirmation", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}")],
    ["cancel uses confirm-aware close", input.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\} disabled=\{mutation\.isPending\}/.test(input)],
    ["create snapshots company and payload", /createCompanyViolation\(input\.companyId, input\.payload\)/.test(input)],
    ["company transition advances generation", /companyGenerationRef\.current \+= 1;\s*if \(!open\) return;/.test(input)],
    ["stale success is rejected", /input\.generation !== companyGenerationRef\.current/.test(input)],
    ["stale error is hidden", /mutation\.variables\?\.generation === companyGenerationRef\.current/.test(input)],
    ["submit snapshots every entity field", /companyId: operatingCompanyId,[\s\S]*generation: companyGenerationRef\.current,[\s\S]*violation_type_uuid: violationTypeUuid,[\s\S]*related_drivers: relatedDriverId \? \[relatedDriverId\] : \[\],[\s\S]*related_units: relatedUnitId \? \[relatedUnitId\] : \[\]/.test(input)],
    ["success retires request and clears draft", /onSuccess: \(_created, input\) => \{[\s\S]*onCreated\(\);\s*companyGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleDriver = source.replace("setRelatedDriverId(null);", "void relatedDriverId;");
  const staleCompany = source.replace("[open, operatingCompanyId, resetDraft, resetMutation]", "[open, resetDraft, resetMutation]");
  const staleClose = source.replace("companyGenerationRef.current += 1;\n    resetDraft();\n    resetMutation();", "resetDraft();\n    resetMutation();");
  const staleCallback = source.replace("input.generation !== companyGenerationRef.current", "false");
  const mutableCompany = source.replace("createCompanyViolation(input.companyId, input.payload)", "createCompanyViolation(operatingCompanyId, input.payload)");
  const bypassCancel = source.replace("onClick={attemptClose}", "onClick={handleClose}");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const checks = [
    failures(staleDriver).includes("complete violation draft reset"),
    failures(staleCompany).includes("reset draft and mutation on open/company change"),
    failures(staleClose).includes("actual close retires request and resets"),
    failures(staleCallback).includes("stale success is rejected"),
    failures(mutableCompany).includes("create snapshots company and payload"),
    failures(bypassCancel).includes("cancel uses confirm-aware close"),
    failures(noConfirm).includes("dirty drawer confirmation"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-company-violation-creator-draft-lifecycle selftest PASS — 7/7 stale/discard entity-draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-company-violation-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-company-violation-creator-draft-lifecycle PASS — Company Violation retires requests and protects every entity-bound dirty draft");
