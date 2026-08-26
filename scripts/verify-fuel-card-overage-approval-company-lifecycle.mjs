#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,80}actionGenerationRef\.current \+= 1;[\s\S]{0,50}\}, \[companyId\]\)/.test(text), "company transition does not advance lifecycle");
  need(/mutationFn: \(input: \{ eventId: string; companyId: string; generation: number \}\) =>[\s\S]{0,180}input\.eventId[\s\S]{0,180}operating_company_id: input\.companyId/.test(text), "approval does not submit immutable event/company/generation");
  need(/onSuccess: \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale success is not rejected");
  need(text.includes('["fuel", "card-overage-events", input.companyId]'), "submitted company queue is not refreshed exactly");
  need(/onError: \(err: unknown, input\) => \{[\s\S]{0,120}input\.generation === actionGenerationRef\.current/.test(text), "stale error is not rejected");
  need(/approveMut\.mutate\(\{ eventId: row\.id, companyId, generation: actionGenerationRef\.current \}\)/.test(text), "UI does not capture approval context");
  need(text.includes("@matrix-built modules=fuel cols=driver,unit,gl_je,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void companyId"],
    [/operating_company_id: input\.companyId/, "operating_company_id: companyId"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/\["fuel", "card-overage-events", input\.companyId\]/, '["fuel", "card-overage-events"]'],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fuel-card-overage-approval-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fuel-card-overage-approval-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-fuel-card-overage-approval-company-lifecycle PASS — approval is isolated to its submitted company/event lifecycle");
