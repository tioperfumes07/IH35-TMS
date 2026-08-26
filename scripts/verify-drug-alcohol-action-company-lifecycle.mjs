#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing action generation"],
    [/createDrugProgramTest\(input\.companyId, input\.payload\)/, "test create uses mutable company/form"],
    [/driver_id: effectiveDriverId[\s\S]*test_type: testType[\s\S]*result: testResult[\s\S]*test_date: testDate/, "test create does not snapshot driver/form"],
    [/bulkEnrollRandomPool\(input\.companyId, input\.consortiumName\)/, "bulk enrollment uses mutable company/name"],
    [/createRtdCase\(input\.companyId, \{ driver_id: input\.driverId \}\)/, "RTD open uses mutable company/driver"],
    [/advanceRtdCase\(input\.caseId, input\.companyId/, "RTD advance uses mutable case/company"],
    [/input\.generation !== actionGenerationRef\.current/g, "stale successes are not rejected"],
    [/actionGenerationRef\.current \+= 1[\s\S]*createTestMutation\.reset\(\)[\s\S]*bulkEnrollMutation\.reset\(\)[\s\S]*openRtdMutation\.reset\(\)[\s\S]*advanceRtdMutation\.reset\(\)/, "company/driver switch leaves stale actions"],
    [/createTestMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale test error can leak"],
    [/openRtdMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale RTD-open error can leak"],
    [/advanceRtdMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale RTD-advance error can leak"],
    [/<EntityPicker[\s\S]*kind="driver"[\s\S]*operatingCompanyId=\{companyId\}/, "driver picker is not canonical/scoped"],
    [/<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{effectiveDriverId\}/, "selected-driver reverse drill is missing"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 4)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "actionGenerationRef = useRef(0)",
    "createDrugProgramTest(input.companyId, input.payload)",
    "bulkEnrollRandomPool(input.companyId, input.consortiumName)",
    "createRtdCase(input.companyId, { driver_id: input.driverId })",
    "advanceRtdCase(input.caseId, input.companyId",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-drug-alcohol-action-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-drug-alcohol-action-company-lifecycle PASS — actions are company/driver stable with canonical linkage");
}
