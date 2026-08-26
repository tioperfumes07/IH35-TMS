#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/units/UnitPermitsTab.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/scopeGenerationRef = useRef\(0\)/, "missing unit/company generation"],
    [/scopeGenerationRef\.current \+= 1[\s\S]*\[unitId, companyId\]/, "scope transition does not advance generation"],
    [/input\.unitId[\s\S]*input\.permitUuid[\s\S]*input\.companyId/, "archive request does not use submitted unit/permit/company"],
    [/input\.generation !== scopeGenerationRef\.current/g, "stale archive callback is not rejected"],
    [/queryKey: \["unit-permits", input\.unitId, input\.companyId\][\s\S]*exact: true/, "refresh is not exact to submitted unit/company"],
    [/resetDeleteMutation\(\)[\s\S]*\[unitId, companyId, resetDeleteMutation\]/, "scope transition does not reset archive pending/error state"],
    [/generation: scopeGenerationRef\.current/, "archive caller does not snapshot generation"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale archive callback is not rejected" && matches.length < 2)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["scopeGenerationRef.current += 1", "scopeGenerationRef.current += 0"],
    ["input.generation !== scopeGenerationRef.current", "false"],
    ["exact: true", "exact: false"],
    ["resetDeleteMutation();", "// planted: prior archive state survives"],
    ["generation: scopeGenerationRef.current", "generation: 0"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-unit-permit-archive-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-unit-permit-archive-company-lifecycle PASS — permit archive state and callbacks remain unit/company-local");
