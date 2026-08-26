#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,100}actionGenerationRef\.current \+= 1;[\s\S]{0,160}setLifecycleTarget\(null\);[\s\S]{0,100}setCreateError\(null\);/.test(text), "company transition does not reset fine actions");
  need(/mutationFn: \(input: \{ companyId: string; generation: number; body: Record<string, unknown> \}\) =>[\s\S]{0,100}createInternalFine\(input\.companyId, input\.body\)/.test(text), "create does not submit immutable company/body/generation");
  need(/onSuccess: async \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale create success is not rejected");
  need(/onError: \(error, input\) => \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current/.test(text), "stale create error is not rejected");
  need(/createMutation\.mutate\(\{ companyId: operatingCompanyId, generation: actionGenerationRef\.current, body: \{ \.\.\.body \} \}\)/.test(text), "creator does not copy its submission context");
  need(/const input = \{[\s\S]{0,220}companyId: operatingCompanyId,[\s\S]{0,100}generation: actionGenerationRef\.current/.test(text), "dispute/void does not capture lifecycle context");
  need(/catch \(error\) \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current[\s\S]{0,60}throw error/.test(text), "current lifecycle errors are not rethrown or stale errors are not contained");
  need(/if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]{0,140}input\.companyId/.test(text), "stale lifecycle success is not rejected or submitted company is not refreshed");
  need(text.includes("@matrix-built modules=safety cols=driver,load,gl_je,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void operatingCompanyId"],
    [/createInternalFine\(input\.companyId, input\.body\)/, "createInternalFine(operatingCompanyId, input.body)"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/body: \{ \.\.\.body \}/, "body"],
    [/companyId: operatingCompanyId/, "companyId: ''"],
    [/throw error;/, "return;"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-internal-fine-actions-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-internal-fine-actions-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-internal-fine-actions-company-lifecycle PASS — create/dispute/void are isolated to submitted company lifecycles");
