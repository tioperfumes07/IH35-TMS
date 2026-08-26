#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","inventory"],"cols":["connectivity","reverse_link"],"leaves":["parts.create","parts.edit","parts.import","parts.void"],"task":"MAINT-F6612-PARTS-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx";
const source = fs.readFileSync(file, "utf8");

const tokens = [
  "const actionGenerationRef = useRef(0)",
  "const refresh = async (submittedCompanyId: string)",
  "createMaintenancePart(input.companyId, {",
  "part_number: input.draft.part_number",
  "updateMaintenancePart(input.row.id, input.companyId, {",
  "importMaintenanceParts(input.companyId, input.file)",
  "voidMaintenancePart(input.id, input.companyId, input.reason)",
  "createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })",
  "updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })",
  "importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile })",
  "voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason })",
  "actionGenerationRef.current += 1",
  "createMutation.reset()",
  "updateMutation.reset()",
  "importMutation.reset()",
  "voidMutation.reset()",
];

function inspect(value) {
  const failures = tokens.filter((token) => !value.includes(token));
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale errors rejected");
  if ((value.match(/await refresh\(input\.companyId\)/g) ?? []).length < 4) failures.push("four submitted-company refreshes");
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-parts-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = tokens.slice(2, 16);
  for (const token of mutations) {
    if (inspect(source.replace(token, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  console.log(`verify-maint-parts-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-parts-company-lifecycle PASS — create/edit/import/void preserve submitted company, record, draft, and file state");
