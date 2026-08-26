#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/SafetyEventsPage.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/mutationFn: async \(input: \{ companyId: string; generation: number; draft: EventDraft \}\)/, "create inputs are not snapshotted"],
    [/operating_company_id: input\.companyId/, "payload uses mutable company"],
    [/subject_driver_id: input\.draft\.subject_driver_id/, "driver FK is not snapshotted"],
    [/subject_unit_id: input\.draft\.subject_unit_id/, "unit FK is not snapshotted"],
    [/related_load_id: input\.draft\.related_load_id/, "load FK is not snapshotted"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["safety", "events-v2", input\.companyId\]/, "wrong company cache can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*setSelectedEventId\(null\)[\s\S]*setLogModalOpen\(false\)/, "company switch leaves stale workflow"],
    [/createMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale error can leak"],
    [/<EntityPicker[\s\S]*kind="driver"[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "driver picker is not canonical/scoped"],
    [/<EntityPicker[\s\S]*kind="unit"[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "unit picker is not canonical/scoped"],
    [/<EntityPicker[\s\S]*kind="load"[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "load picker is not canonical/scoped"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "operating_company_id: input.companyId",
    "subject_driver_id: input.draft.subject_driver_id",
    "subject_unit_id: input.draft.subject_unit_id",
    "related_load_id: input.draft.related_load_id",
    "input.generation !== companyGenerationRef.current",
    'queryKey: ["safety", "events-v2", input.companyId]',
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-safety-event-create-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-safety-event-create-company-lifecycle PASS — create is company-stable with driver/unit/load FKs");
}
