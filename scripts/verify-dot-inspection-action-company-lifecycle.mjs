#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/createDotInspection\(input\.companyId, input\.payload\)/, "create uses mutable company/form"],
    [/driver_id: form\.driver_id \|\| undefined[\s\S]*unit_id: form\.unit_id \|\| undefined[\s\S]*trailer_id: form\.trailer_id \|\| undefined/, "create does not snapshot driver/unit/trailer FKs"],
    [/voidDotInspection\(input\.companyId, input\.id, input\.reason\)/, "void uses mutable company"],
    [/uploadDotInspectionPdf\(input\.companyId, input\.id, input\.file\)/, "upload uses mutable company"],
    [/followUpDotInspectionEvent\(input\.id, input\.companyId, input\.state\)/, "follow-up uses mutable company"],
    [/input\.generation !== companyGenerationRef\.current/g, "stale successes are not rejected"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*voidMutation\.reset\(\)[\s\S]*uploadMutation\.reset\(\)[\s\S]*followUpMutation\.reset\(\)/, "company switch leaves stale actions"],
    [/createMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale create error can leak"],
    [/followUpMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale follow-up error can leak"],
    [/uploadMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale upload error can leak"],
    [/<EntityPicker[\s\S]*kind="unit"[\s\S]*operatingCompanyId=\{companyId\}/, "unit picker is not canonical/scoped"],
    [/<EntityPicker[\s\S]*kind="trailer"[\s\S]*operatingCompanyId=\{companyId\}/, "trailer picker is not canonical/scoped"],
    [/kind="work_order"[\s\S]*auto_spawned_wo_id/, "spawned work-order reverse drill is missing"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 4)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "createDotInspection(input.companyId, input.payload)",
    "voidDotInspection(input.companyId, input.id, input.reason)",
    "uploadDotInspectionPdf(input.companyId, input.id, input.file)",
    "followUpDotInspectionEvent(input.id, input.companyId, input.state)",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-dot-inspection-action-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-dot-inspection-action-company-lifecycle PASS — actions are company-stable with canonical linkage");
}
