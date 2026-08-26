#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/operating_company_id: input\.companyId[\s\S]*year: input\.year[\s\S]*quarter: input\.quarter/, "draw does not use immutable company/year/quarter input"],
    [/input\.generation !== companyGenerationRef\.current/, "stale draw success is not rejected"],
    [/companyGenerationRef\.current \+= 1[\s\S]*drawMutation\.reset\(\)/, "company switch does not reset the draw workflow"],
    [/drawMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale draw errors can leak into the next company"],
    [/\["compliance", "drug-alcohol", "annual-rate", input\.companyId, input\.year\]/, "annual-rate refresh is not pinned to the submitting company"],
    [/\["compliance", "drug-alcohol", "pool", input\.companyId\]/, "pool refresh is not pinned to the submitting company"],
    [/\["compliance", "drug-alcohol", "rtd", input\.companyId\]/, "RTD refresh is not pinned to the submitting company"],
    [/companyId,[\s\S]*generation: companyGenerationRef\.current[\s\S]*year,[\s\S]*quarter: currentQuarter\(\)/, "button does not snapshot the draw inputs"],
  ];
  for (const [pattern, message] of checks) {
    if (!pattern.test(value)) failures.push(message);
  }
  if (/invalidateQueries\(\{ queryKey: \["compliance", "drug-alcohol"\] \}\)/.test(value)) {
    failures.push("draw must not invalidate every company's drug/alcohol cache");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["companyGenerationRef = useRef(0)", "companyGenerationRef = { current: 0 }"],
    ["operating_company_id: input.companyId", "operating_company_id: companyId"],
    ["input.generation !== companyGenerationRef.current", "false"],
    ["drawMutation.reset();", "// planted: draw survives company switch"],
    ["drawMutation.variables?.generation === companyGenerationRef.current", "true"],
    ['["compliance", "drug-alcohol", "pool", input.companyId]', '["compliance", "drug-alcohol", "pool"]'],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-drug-alcohol-dashboard-draw-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-drug-alcohol-dashboard-draw-company-lifecycle PASS — random draw callbacks and refreshes remain company-local");
