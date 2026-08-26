#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["unit","connectivity","reverse_link"],"leaves":["wo.labor.start","wo.labor.stop","wo.labor.manual","wo.labor.rate","wo.labor.remove"],"task":"MAINT-F6615-LABOR-ACTION-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const source = fs.readFileSync(file, "utf8");
const tokens = [
  "const actionGenerationRef = useRef(0)",
  "startWoTimeEntry(input.workOrderId, {\n        operating_company_id: input.companyId,",
  "stopWoTimeEntry(input.entryId, input.companyId)",
  "createWoTimeEntryManual({\n        operating_company_id: input.companyId,\n        work_order_id: input.workOrderId,",
  "patchWoTimeEntry(input.entryId, {\n        operating_company_id: input.companyId,",
  "deleteWoTimeEntry(input.entryId, input.companyId)",
  "input.generation !== actionGenerationRef.current",
  "input.generation === actionGenerationRef.current",
  "invalidate(input.workOrderId, input.companyId)",
  "actionGenerationRef.current += 1",
  "startMut.reset()",
  "stopMut.reset()",
  "manualMut.reset()",
  "patchMut.reset()",
  "deleteMut.reset()",
  "setRateTarget({ entryId: id, currentRateCents })",
  'title="Update labor rate"',
  "<MoneyInput",
  "laborRateCents: rateValueCents",
];

function inspect(value) {
  const failures = tokens.filter((token) => !value.includes(token));
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 5) failures.push("five stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 5) failures.push("five stale errors rejected");
  if ((value.match(/invalidate\(input\.workOrderId, input\.companyId\)/g) ?? []).length < 5) failures.push("five submitted-scope invalidations");
  if (value.includes("window.prompt")) failures.push("native rate prompt remains");
  return failures;
}
const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-labor-action-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = tokens.slice(1);
  for (const token of mutations) {
    if (inspect(source.split(token).join("PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  const promptMutation = `${source}\nwindow.prompt("rate")`;
  if (inspect(promptMutation).length === 0) throw new Error("selftest missed native prompt");
  console.log(`verify-maint-labor-action-company-lifecycle --selftest PASS (${mutations.length + 1}/${mutations.length + 1} planted defects red)`);
  process.exit(0);
}
console.log("verify-maint-labor-action-company-lifecycle PASS — five labor actions preserve submitted WO/company/action state and rate editing uses in-app MoneyInput chrome");
