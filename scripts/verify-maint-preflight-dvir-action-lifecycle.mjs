#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/routePreFlightDvirDefect\(input\.defectId, input\.companyId\)/, "route does not use immutable defect/company"],
    [/setPreFlightDvirSeverity\(input\.defectId, \{ operating_company_id: input\.companyId, severity: "minor" \}\)/, "downgrade does not use immutable defect/company"],
    [(value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale successes must be rejected"],
    [(value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale errors must be rejected"],
    [(value.match(/queryKey: \["maintenance", "pre-flight-dvir", input\.companyId\]/g) ?? []).length === 2 ? /./ : /$a/, "both refreshes must target submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*routeMut\.reset\(\)[\s\S]*downgradeMut\.reset\(\)[\s\S]*\[operatingCompanyId\]/, "company transition does not reset both actions"],
    [/\{ defectId, companyId: operatingCompanyId, generation: actionGenerationRef\.current \}/, "action input does not snapshot defect/company/generation"],
    [/routeMut\.mutate\(actionInput\(row\.id\)\)[\s\S]*downgradeMut\.mutate\(actionInput\(row\.id\)\)/, "mounted actions bypass guarded input"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.defectId, input.companyId", "defectId, operatingCompanyId"],
    ["input.defectId, { operating_company_id: input.companyId", "defectId, { operating_company_id: operatingCompanyId"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["routeMut.reset();", "// planted: route state survives"],
    ["downgradeMut.reset();", "// planted: downgrade state survives"],
    ["companyId: operatingCompanyId", "companyId: ''"],
    ["routeMut.mutate(actionInput(row.id))", "routeMut.mutate(row.id)"],
    ["downgradeMut.mutate(actionInput(row.id))", "downgradeMut.mutate(row.id)"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-preflight-dvir-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-preflight-dvir-action-lifecycle PASS — route/downgrade remain company-local");
