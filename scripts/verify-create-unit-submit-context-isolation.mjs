#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","home"],"cols":["unit","connectivity","qbo_chrome","reverse_link"],"leaves":["home.create_unit","fleet.modal.create_unit"],"task":"CLASS-F6525-CREATE-UNIT-SUBMIT-CONTEXT-ISOLATION","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/CreateUnitModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["submit captures draft, company, and generation", /createMutation\.mutate\(\{[\s\S]{0,160}draft: \{ \.\.\.draft \},[\s\S]{0,100}operatingCompanyId,[\s\S]{0,100}generation: actionGenerationRef\.current/.test(input)],
    ["mutation consumes immutable submission", /mutationFn: \(\{ draft: submittedDraft, operatingCompanyId: submittedCompanyId \}: CreateUnitSubmission\)/.test(input)],
    ["canonical lease scope uses submitted context", /currently_leased_to_company_id: submittedDraft\.currently_leased_to_company_id \|\| submittedCompanyId/.test(input)],
    ["success rejects stale generations", /onSuccess: async \(created, submission\)[\s\S]*?if \(submission\.generation !== actionGenerationRef\.current\) return;[\s\S]*?onCreated\?\.\(String\(created\.id\), submission\.draft\.unit_number\.trim\(\)\);[\s\S]*?resetAndClose\(\);/.test(input)],
    ["error rejects stale generations", /onError: \(error, submission\)[\s\S]*?submission\.generation === actionGenerationRef\.current[\s\S]*?pushToast/.test(input)],
    ["scope transitions advance generation", /(actionGenerationRef\.current \+= 1;[\s\S]*?){2}/.test(input)],
    ["unit writer remains canonical", /return createUnit\(\{/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutableDraft = source.replace("draft: { ...draft }", "draft");
  const currentCompany = source.replace("|| submittedCompanyId", "|| operatingCompanyId");
  const staleSuccess = source.replace("if (submission.generation !== actionGenerationRef.current) return;", "void submission.generation;");
  const staleError = source.replace("submission.generation === actionGenerationRef.current", "true");
  const noGenerationAdvance = source.replaceAll("actionGenerationRef.current += 1;", "void actionGenerationRef.current;");
  const checks = [
    failures(mutableDraft).includes("submit captures draft, company, and generation"),
    failures(currentCompany).includes("canonical lease scope uses submitted context"),
    failures(staleSuccess).includes("success rejects stale generations"),
    failures(staleError).includes("error rejects stale generations"),
    failures(noGenerationAdvance).includes("scope transitions advance generation"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-create-unit-submit-context-isolation selftest PASS — 5/5 mutable-context mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-unit-submit-context-isolation FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-create-unit-submit-context-isolation PASS — create result cannot cross company/draft contexts");
