#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx";
const source = fs.readFileSync(file, "utf8");

function audit(text) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(text.includes("actionGenerationRef = useRef(0)"), "generation ref missing");
  need(/useEffect\(\(\) => \{[\s\S]{0,100}actionGenerationRef\.current \+= 1;[\s\S]{0,100}setAcknowledgeError\(null\)/.test(text), "company transition does not reset reminder lifecycle");
  need(/mutationFn: \(input: \{ reminderId: string; companyId: string; generation: number \}\) =>[\s\S]{0,100}acknowledgeSafetyReminder\(input\.reminderId, input\.companyId\)/.test(text), "acknowledgment does not submit immutable context");
  need(/onSuccess: async \(_result, input\) => \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current/.test(text), "stale success is not rejected");
  need(text.includes('["safety", "reminders", input.companyId]'), "submitted company reminders are not refreshed exactly");
  need(/onError: \(error, input\) => \{[\s\S]{0,100}input\.generation === actionGenerationRef\.current/.test(text), "stale error is not rejected");
  need(/acknowledgeMutation\.mutate\(\{ reminderId: row\.id, companyId, generation: actionGenerationRef\.current \}\)/.test(text), "row action does not capture reminder context");
  need(text.includes("@matrix-built modules=safety cols=driver,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/actionGenerationRef\.current \+= 1/, "void companyId"],
    [/acknowledgeSafetyReminder\(input\.reminderId, input\.companyId\)/, "acknowledgeSafetyReminder(input.reminderId, companyId)"],
    [/if \(input\.generation !== actionGenerationRef\.current\) return;/, "if (false) return;"],
    [/\["safety", "reminders", input\.companyId\]/, '["safety", "reminders", companyId]'],
    [/input\.generation === actionGenerationRef\.current/, "true"],
    [/generation: actionGenerationRef\.current/, "generation: 0"],
  ];
  for (const [index, [pattern, replacement]] of mutations.entries()) {
    const mutated = source.replace(pattern, replacement);
    if (mutated === source || audit(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-dot-reminder-ack-company-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-dot-reminder-ack-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-dot-reminder-ack-company-lifecycle PASS — reminder acknowledgment is isolated to submitted company lifecycle");
