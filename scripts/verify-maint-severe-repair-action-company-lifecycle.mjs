#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["unit","connectivity","reverse_link","qbo_chrome"],"leaves":["severe_repairs.convert_to_wo"],"task":"MAINT-F6616-SEVERE-REPAIR-ACTION-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx";
const source = fs.readFileSync(file, "utf8");
const tokens = [
  "const actionGenerationRef = useRef(0)",
  "refreshSevereRepairEstimate(input.estimateId, input.companyId)",
  "completeWorkOrder(input.workOrderId, input.companyId)",
  "markUnitOos(input.unitId, {\n        operating_company_id: input.companyId,",
  "markUnitBackInService(input.unitId, {\n        operating_company_id: input.companyId,",
  "input.generation !== actionGenerationRef.current",
  "input.generation === actionGenerationRef.current",
  "refreshAll(input.companyId)",
  "actionGenerationRef.current += 1",
  "refreshMutation.reset()",
  "completeMutation.reset()",
  "markOosMutation.reset()",
  "returnMutation.reset()",
  "setMarkOosOpen(false)",
  "setReturnOpen(false)",
];

function inspect(value) {
  const failures = tokens.filter((token) => !value.includes(token));
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale errors rejected");
  if ((value.match(/refreshAll\(input\.companyId\)/g) ?? []).length < 4) failures.push("four submitted-company refreshes");
  if (!/markOosMutation\.mutateAsync\(\{[\s\S]*?unitId: selectedUnitId,[\s\S]*?companyId: operatingCompanyId,[\s\S]*?reason: oosReason\.trim\(\),[\s\S]*?location: oosLocation\.trim\(\),[\s\S]*?generation: actionGenerationRef\.current/.test(value)) failures.push("mark-OOS submit snapshot incomplete");
  if (!/returnMutation\.mutateAsync\(\{[\s\S]*?unitId: returnEstimate\.unit_id,[\s\S]*?companyId: operatingCompanyId,[\s\S]*?notes: returnNotes\.trim\(\),[\s\S]*?generation: actionGenerationRef\.current/.test(value)) failures.push("return-to-service submit snapshot incomplete");
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-severe-repair-action-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = tokens.slice(1);
  for (const token of mutations) {
    if (inspect(source.split(token).join("PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  for (const [label, pattern] of [
    ["mark-OOS snapshot", "reason: oosReason.trim(),"],
    ["return snapshot", "notes: returnNotes.trim(),"],
  ]) {
    if (inspect(source.replace(pattern, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${label}`);
  }
  console.log(`verify-maint-severe-repair-action-company-lifecycle --selftest PASS (${mutations.length + 2}/${mutations.length + 2} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-severe-repair-action-company-lifecycle PASS — refresh/complete/OOS/return preserve submitted company and reject stale callbacks");
