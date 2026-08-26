#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,100}actionGenerationRef\.current \+= 1;[\s\S]{0,100}setReviewError\(null\)/.test(text), "company transition does not reset review lifecycle");
  need(/mutationFn: \(input: \{ observationId: string; companyId: string; generation: number \}\) =>[\s\S]{0,100}reviewIntegrityObservation\(input\.companyId, input\.observationId\)/.test(text), "review does not submit immutable context");
  need(/onSuccess: async \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale success is not rejected");
  need(text.includes('["safety-v64", "integrity", "observations", input.companyId]'), "submitted company observations are not refreshed exactly");
  need(/onError: \(error, input\) => \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current/.test(text), "stale error is not rejected");
  need(/reviewMutation\.mutate\(\{ observationId: rowId, companyId, generation: actionGenerationRef\.current \}\)/.test(text), "row action does not capture review context");
  need(text.includes("@matrix-built modules=safety cols=driver,unit,vendor,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void companyId"],
    [/reviewIntegrityObservation\(input\.companyId, input\.observationId\)/, "reviewIntegrityObservation(companyId, input.observationId)"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/\["safety-v64", "integrity", "observations", input\.companyId\]/, '["safety-v64", "integrity", "observations", companyId]'],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-integrity-review-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-integrity-review-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-integrity-review-company-lifecycle PASS — integrity review is isolated to submitted company lifecycle");
