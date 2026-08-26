#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/ReturnToDuty.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/mutationFn: \(input: \{ companyId: string; generation: number; testId: string \}\)/, "report input is not immutable"],
    [/results\/\$\{input\.testId\}\/clearinghouse/, "request does not use snapped test id"],
    [/operating_company_id: input\.companyId/, "request does not use snapped company"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["compliance", "drug-alcohol", "results", input\.companyId\]/, "wrong company results can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*reportMutation\.reset\(\)/, "company transition does not reset mutation"],
    [/reportMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale error can leak into next company"],
    [/<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{row\.driver_id/, "pending report lacks driver reverse drill"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "operating_company_id: input.companyId",
    "input.generation !== companyGenerationRef.current",
    'queryKey: ["compliance", "drug-alcohol", "results", input.companyId]',
    "reportMutation.variables?.generation === companyGenerationRef.current",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-rtd-clearinghouse-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-rtd-clearinghouse-company-lifecycle PASS — report mutation is company-stable and driver-linked");
}
