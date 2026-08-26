#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","home"],"cols":["unit","connectivity","qbo_chrome","reverse_link"],"leaves":["home.create_unit","fleet.modal.create_unit"],"task":"CLASS-F6525-CREATE-UNIT-SUBMIT-CONTEXT-ISOLATION","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/CreateUnitModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["submit captures draft and company", /createMutation\.mutate\(\{ draft: \{ \.\.\.draft \}, operatingCompanyId \}\)/.test(input)],
    ["mutation consumes immutable submission", /mutationFn: \(\{ draft: submittedDraft, operatingCompanyId: submittedCompanyId \}: CreateUnitSubmission\)/.test(input)],
    ["canonical lease scope uses submitted context", /currently_leased_to_company_id: submittedDraft\.currently_leased_to_company_id \|\| submittedCompanyId/.test(input)],
    ["success rejects cross-company selection", /onSuccess: async \(created, submission\)[\s\S]*?if \(submission\.operatingCompanyId !== operatingCompanyId\) return;[\s\S]*?onCreated\?\.\(String\(created\.id\), submission\.draft\.unit_number\.trim\(\)\);[\s\S]*?resetAndClose\(\);/.test(input)],
    ["unit writer remains canonical", /return createUnit\(\{/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutableDraft = source.replace("draft: { ...draft }", "draft");
  const currentCompany = source.replace("|| submittedCompanyId", "|| operatingCompanyId");
  const crossContext = source.replace("if (submission.operatingCompanyId !== operatingCompanyId) return;", "void submission.operatingCompanyId;");
  const checks = [
    failures(mutableDraft).includes("submit captures draft and company"),
    failures(currentCompany).includes("canonical lease scope uses submitted context"),
    failures(crossContext).includes("success rejects cross-company selection"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-create-unit-submit-context-isolation selftest PASS — 3/3 mutable-context mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-unit-submit-context-isolation FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-create-unit-submit-context-isolation PASS — create result cannot cross company/draft contexts");
