#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/FinesPage.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,100}actionGenerationRef\.current \+= 1;[\s\S]{0,180}setSelectedFine\(null\);[\s\S]{0,100}setConvertError\(null\);/.test(text), "company transition does not reset fine action context");
  need(/mutationFn: \(input: \{ fineId: string; companyId: string; generation: number; queryKey: readonly unknown\[\] \}\) =>[\s\S]{0,100}convertFineToLiability\(input\.fineId, input\.companyId\)/.test(text), "conversion does not submit immutable context");
  need(/onSuccess: \(payload, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale success is not rejected");
  need(/setQueryData\([\s\S]{0,50}input\.queryKey/.test(text), "submitted fine query is not updated exactly");
  need(/onError: \(error, input\) => \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current/.test(text), "stale error is not rejected");
  need(/convertMutation\.mutate\(\{[\s\S]{0,160}companyId: operatingCompanyId,[\s\S]{0,120}generation: actionGenerationRef\.current,[\s\S]{0,120}queryKey: finesQueryKey/.test(text), "drawer does not capture conversion context");
  need(text.includes("@matrix-built modules=safety cols=driver,unit,load,gl_je,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void operatingCompanyId"],
    [/convertFineToLiability\(input\.fineId, input\.companyId\)/, "convertFineToLiability(input.fineId, operatingCompanyId)"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/input\.queryKey/, "finesQueryKey"],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-external-fine-convert-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-external-fine-convert-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-external-fine-convert-company-lifecycle PASS — conversion is isolated to its submitted company/fine/query lifecycle");
