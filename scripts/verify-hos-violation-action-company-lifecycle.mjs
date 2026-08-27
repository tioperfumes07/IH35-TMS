#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", "utf8");
const backendSource = fs.readFileSync("apps/backend/src/routes/safety/hos-violations.ts", "utf8");

function inspect(value, backend = backendSource) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/createHosViolation\(input\.companyId, input\.payload\)/, "create uses mutable company/form"],
    [/driver_id: form\.driver_id\.trim\(\)[\s\S]*related_load_id: form\.related_load_id \|\| null/, "create does not snapshot driver/load FKs"],
    [/dot_violation_type_id: selectedViolationType\?\.id \?\? null/, "catalog FK is not snapshotted"],
    [/voidHosViolation\(input\.companyId, input\.id, input\.reason\)/, "void uses mutable company"],
    [/input\.generation !== companyGenerationRef\.current/g, "stale successes are not rejected"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*voidMutation\.reset\(\)[\s\S]*setVoidTarget\(null\)[\s\S]*setForm\(emptyHosViolationForm\(\)\)/, "company switch leaves stale actions"],
    [/createMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale create error can leak"],
    [/<DriverPickerWithCreate[\s\S]*operatingCompanyId=\{companyId\}/, "driver picker is not canonical/scoped"],
    [/<EntityPicker[\s\S]*kind="load"[\s\S]*operatingCompanyId=\{companyId\}/, "load picker is not canonical/scoped"],
    [/kind="driver"[\s\S]*row\.driver_id/, "driver reverse drill is missing"],
    [/kind="load"[\s\S]*row\.related_load_id/, "load reverse drill is missing"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 2)) failures.push(message);
  }
  if (!/"safety\.hos_violation\.created",[\s\S]{0,220}operating_company_id: query\.data\.operating_company_id/.test(backend)) {
    failures.push("create audit must identify the operating company");
  }
  if (!/"safety\.hos_violation\.voided",[\s\S]{0,220}operating_company_id: query\.data\.operating_company_id/.test(backend)) {
    failures.push("void audit must identify the operating company");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "createHosViolation(input.companyId, input.payload)",
    "voidHosViolation(input.companyId, input.id, input.reason)",
    "driver_id: form.driver_id.trim()",
    "dot_violation_type_id: selectedViolationType?.id ?? null",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  const mutatedBackend = backendSource.replace("operating_company_id: query.data.operating_company_id,", "");
  if (mutatedBackend === backendSource || inspect(source, mutatedBackend).length === 0) throw new Error("missed scoped audit mutation");
  console.log(`verify-hos-violation-action-company-lifecycle --selftest PASS (${mutations.length + 1}/${mutations.length + 1})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-hos-violation-action-company-lifecycle PASS — actions are company-stable with canonical driver/load linkage");
}
