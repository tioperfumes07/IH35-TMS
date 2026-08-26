#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/CSAMitigationQueue.tsx";
const source = fs.readFileSync(file, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/mutationFn: \(input: \{ companyId: string; generation: number; category:/, "create input is not snapshotted"],
    [/createAction\(input\.companyId, input\.category, input\.dueDate\)/, "create uses mutable page state"],
    [/markCompleted\(input\.companyId, input\.actionId\)/, "complete uses mutable company"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["compliance-csa", "mitigation-queue", input\.companyId\]/, "wrong company cache can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*completeMutation\.reset\(\)/, "company transition does not reset workflows"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "createAction(input.companyId, input.category, input.dueDate)",
    "markCompleted(input.companyId, input.actionId)",
    "input.generation !== companyGenerationRef.current",
    'queryKey: ["compliance-csa", "mitigation-queue", input.companyId]',
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-csa-mitigation-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-csa-mitigation-company-lifecycle PASS — create/complete are company-stable");
}
