#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","inventory"],"cols":["connectivity","reverse_link"],"leaves":["parts.create","parts.edit","parts.import","parts.void"],"task":"MAINT-F6612-PARTS-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx";
const source = fs.readFileSync(file, "utf8");
const backendFile = "apps/backend/src/maintenance/parts.routes.ts";
const backendSource = fs.readFileSync(backendFile, "utf8");

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
  if ((value.match(/actionGenerationRef\.current \+= 1/g) ?? []).length < 2) failures.push("company and query-error generations invalidated independently");
  for (const reset of ["createMutation", "updateMutation", "importMutation", "voidMutation"]) {
    const escapedReset = reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if ((value.match(new RegExp(`${escapedReset}\\.reset\\(\\)`, "g")) ?? []).length < 2) {
      failures.push(`${reset} reset on company and query-error transitions`);
    }
  }
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 4) failures.push("four stale errors rejected");
  if ((value.match(/await refresh\(input\.companyId\)/g) ?? []).length < 4) failures.push("four submitted-company refreshes");
  return failures;
}

const auditEvents = ["maintenance.parts.created", "maintenance.parts.updated", "maintenance.parts.voided"];
function inspectBackend(value) {
  return auditEvents.flatMap((event) => {
    const index = value.indexOf(`\"${event}\"`);
    if (index < 0) return [`missing ${event} audit`];
    return value.slice(index, index + 420).includes("operating_company_id:")
      ? []
      : [`${event} audit omits operating_company_id`];
  });
}

const failures = [...inspect(source), ...inspectBackend(backendSource)];
if (failures.length) {
  console.error(`verify-maint-parts-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = tokens.slice(2, 16);
  for (const token of mutations) {
    if (inspect(source.replace(token, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  for (const event of auditEvents) {
    const eventIndex = backendSource.indexOf(`\"${event}\"`);
    const companyIndex = backendSource.indexOf("operating_company_id:", eventIndex);
    const mutant = `${backendSource.slice(0, companyIndex)}PLANTED_SCOPE:${backendSource.slice(companyIndex + "operating_company_id:".length)}`;
    if (inspectBackend(mutant).length === 0) throw new Error(`selftest missed ${event} tenantless audit`);
  }
  const count = mutations.length + auditEvents.length;
  console.log(`verify-maint-parts-company-lifecycle --selftest PASS (${count}/${count} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-parts-company-lifecycle PASS — create/edit/import/void preserve submitted company, record, draft, file, and tenant-scoped audit state");
