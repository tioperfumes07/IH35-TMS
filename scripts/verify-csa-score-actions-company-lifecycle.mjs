#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/tabs/CSAScoreTab.tsx";
const source = fs.readFileSync(file, "utf8");
const backendFile = "apps/backend/src/routes/safety/csa-scores.ts";
const backendSource = fs.readFileSync(backendFile, "utf8");

function audit(text, backend = backendSource) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,100}actionGenerationRef\.current \+= 1;[\s\S]{0,180}setRecomputeError\(null\);[\s\S]{0,100}setSaferError\(null\)/.test(text), "company transition does not reset CSA actions");
  need(/mutationFn: \(input: \{ companyId: string; generation: number \}\) => recomputeCsa\(input\.companyId\)/.test(text), "recompute does not submit immutable company context");
  need(/onSuccess: async \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale recompute success is not rejected");
  need(text.includes('["safety-v64", "csa-current", input.companyId]') && text.includes('["safety-v64", "csa-history", input.companyId]'), "submitted company CSA queries are not refreshed exactly");
  need(/onError: \(error, input\) => \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current/.test(text), "stale recompute error is not rejected");
  need(/mutationFn: \(input: \{ companyId: string; generation: number \}\) => pullCsaFromSafer\(input\.companyId\)/.test(text), "SAFER check does not submit immutable company context");
  need((text.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length >= 2, "stale SAFER error is not rejected");
  need((text.match(/mutate\(\{ companyId, generation: actionGenerationRef\.current \}\)/g) ?? []).length === 2, "both CSA actions must capture company/generation");
  need(text.includes("@matrix-built modules=safety cols=connectivity,reverse_link"), "leaf annotation missing");
  need(/"safety\.csa_score\.computed",[\s\S]{0,180}operating_company_id: companyId/.test(backend), "CSA recompute audit omits operating company");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void companyId"],
    [/recomputeCsa\(input\.companyId\)/, "recomputeCsa(companyId)"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/\["safety-v64", "csa-current", input\.companyId\]/, '["safety-v64", "csa-current", companyId]'],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/pullCsaFromSafer\(input\.companyId\)/, "pullCsaFromSafer(companyId)"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  const mutatedBackend = backendSource.replace("operating_company_id: companyId,", "");
  if (mutatedBackend === backendSource || audit(source, mutatedBackend).length === 0) throw new Error(`mutation ${mutations.length + 1} escaped`);
  console.log(`verify-csa-score-actions-company-lifecycle selftest PASS — ${mutations.length + 1}/${mutations.length + 1} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-csa-score-actions-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-csa-score-actions-company-lifecycle PASS — recompute and SAFER checks are company-lifecycle isolated");
