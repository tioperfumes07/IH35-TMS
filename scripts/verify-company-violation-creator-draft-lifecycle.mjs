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
    ["all dismiss paths reset", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*resetMutation\(\);\s*onClose\(\);/.test(input)],
    ["drawer dismiss uses reset close", input.includes('open={open} onClose={handleClose} title="Create Company Violation"')],
    ["cancel uses reset close", /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["success clears draft", /onSuccess: \(\) => \{\s*onCreated\(\);\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleDriver = source.replace("setRelatedDriverId(null);", "void relatedDriverId;");
  const staleCompany = source.replace("[open, operatingCompanyId, resetDraft, resetMutation]", "[open, resetDraft, resetMutation]");
  const staleError = source.replace("resetMutation();\n    onClose();", "onClose();");
  const checks = [
    failures(staleDriver).includes("complete violation draft reset"),
    failures(staleCompany).includes("reset draft and mutation on open/company change"),
    failures(staleError).includes("all dismiss paths reset"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-company-violation-creator-draft-lifecycle selftest PASS — 3/3 stale entity-draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-company-violation-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-company-violation-creator-draft-lifecycle PASS — Company Violation creator resets every entity-bound field and error state");
