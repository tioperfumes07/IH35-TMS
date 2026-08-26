#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/updateMaintenancePmAutoEngineSettings\(\{ operating_company_id: input\.companyId, is_paused: input\.isPaused \}\)/, "settings write does not use immutable company/state"],
    [/runMaintenancePmAutoEngineNow\(input\.companyId\)/, "manual run does not use immutable company"],
    [(value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale successes must be rejected"],
    [(value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length === 2 ? /./ : /$a/, "both stale errors must be rejected"],
    [(value.match(/queryKey: \["maintenance", "pm-auto-engine", input\.companyId\]/g) ?? []).length === 2 ? /./ : /$a/, "both refreshes must target submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*settingsM\.reset\(\)[\s\S]*runNowM\.reset\(\)[\s\S]*\[companyId\]/, "company transition does not reset both actions"],
    [/settingsM\.mutate\(\{ companyId, generation: actionGenerationRef\.current, isPaused: !isPaused \}\)/, "settings caller does not snapshot company/generation/state"],
    [/runNowM\.mutate\(\{ companyId, generation: actionGenerationRef\.current \}\)/, "run caller does not snapshot company/generation"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.companyId, is_paused: input.isPaused", "companyId, is_paused: isPaused"],
    ["runMaintenancePmAutoEngineNow(input.companyId)", "runMaintenancePmAutoEngineNow(companyId)"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["settingsM.reset();", "// planted: settings state survives"],
    ["runNowM.reset();", "// planted: run state survives"],
    ["companyId, generation: actionGenerationRef.current, isPaused: !isPaused", "companyId: '', generation: 0, isPaused: !isPaused"],
    ["runNowM.mutate({ companyId, generation: actionGenerationRef.current })", "runNowM.mutate()"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-pm-auto-engine-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-pm-auto-engine-action-lifecycle PASS — settings/run remain company-local");
