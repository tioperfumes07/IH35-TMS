#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["settings"],"task":"FUEL-F6654-PLANNER-SETTINGS-COMPANY-LIFECYCLE","vertical":"column-wave"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const source = fs.readFileSync(file, "utf8");
const backendFile = "apps/backend/src/fuel/planner.routes.ts";
const backendSource = fs.readFileSync(backendFile, "utf8");

function inspect(text, backend = backendSource) {
  const failures = [];
  const settingsBlock = text.slice(text.indexOf("function PlannerSettingsForm"));
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/lifecycleGenerationRef = useRef\(0\)/.test(settingsBlock), "settings lifecycle generation missing");
  need(/mutationFn: \(input: \{ companyId: string; generation: number; body:[\s\S]*updateFuelPlannerSettings\(input\.companyId, input\.body\)/.test(settingsBlock), "save does not use immutable company/body input");
  need((settingsBlock.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0) === 2, "success and failure must reject stale generation");
  need(/queryKey: \["fuel", "planner", "settings", input\.companyId\]/.test(settingsBlock), "refresh is not pinned to submitted company");
  need(/useEffect\(\(\) => \{[\s\S]*lifecycleGenerationRef\.current \+= 1;[\s\S]*mutation\.reset\(\);[\s\S]*setMaxMilesPerShift[\s\S]*setMaxOffHighway[\s\S]*setMaxBackwards[\s\S]*setOverfillPct[\s\S]*setExpensiveStates[\s\S]*\}, \[companyId, settings\]\)/.test(settingsBlock), "company/settings transition does not reset complete canonical draft");
  need(/mutation\.mutate\(\{\s*companyId,\s*generation: lifecycleGenerationRef\.current,\s*body: \{[\s\S]*max_miles_per_shift:[\s\S]*max_off_highway_miles:[\s\S]*max_backwards_miles:[\s\S]*overfill_threshold_pct:[\s\S]*expensive_states: \[\.\.\.expensiveStates\]/.test(settingsBlock), "UI does not snapshot complete planner settings intent");
  need(/expensive_states: z\.array\([\s\S]{0,100}\)\.max\(50\)\.optional\(\)/.test(backend) && !/expensive_states:[^\n]*\.min\(1\)/.test(backend), "backend rejects an honestly cleared expensive-states list");
  need(/if \(body\.data\.expensive_states !== undefined\)/.test(backend), "backend does not distinguish an empty submitted list from an omitted field");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("updateFuelPlannerSettings(input.companyId, input.body)", "updateFuelPlannerSettings(companyId, input.body)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace('["fuel", "planner", "settings", input.companyId]', '["fuel", "planner", "settings", companyId]'),
    source.replace("mutation.reset();", "// planted: mutation survives"),
    source.replace("generation: lifecycleGenerationRef.current,", "generation: 0,"),
    source.replace("expensive_states: [...expensiveStates]", "expensive_states: []"),
  ];
  for (const [index, candidate] of mutations.entries()) {
    if (candidate === source || inspect(candidate).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  const backendMutations = [
    backendSource.replace(".max(50).optional()", ".min(1).max(50).optional()"),
    backendSource.replace("if (body.data.expensive_states !== undefined)", "if (body.data.expensive_states)"),
  ];
  for (const [index, candidate] of backendMutations.entries()) {
    if (candidate === backendSource || inspect(source, candidate).length === 0) throw new Error(`backend mutation ${index + 1} escaped`);
  }
  console.log(`verify-fuel-planner-settings-company-lifecycle selftest PASS — ${mutations.length + backendMutations.length}/${mutations.length + backendMutations.length} planted defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-fuel-planner-settings-company-lifecycle FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-fuel-planner-settings-company-lifecycle PASS — planner settings save is company/generation/body stable");
