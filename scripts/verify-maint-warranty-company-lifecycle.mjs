#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","vendors"],"cols":["vendor","connectivity","reverse_link"],"leaves":["warranty.create_claim","warranty.file_claim","warranty.detect_from_wo"],"task":"MAINT-F6613-WARRANTY-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx";
const source = fs.readFileSync(file, "utf8");
const backendFile = "apps/backend/src/maintenance/warranty.routes.ts";
const backendSource = fs.readFileSync(backendFile, "utf8");
const tokens = [
  "const actionGenerationRef = useRef(0)",
  "const refresh = async (submittedCompanyId: string)",
  "createMaintenanceWarrantyClaim({\n        operating_company_id: input.companyId,",
  "part_description: input.draft.part_description",
  "fileMaintenanceWarrantyClaim(input.id, {\n        operating_company_id: input.companyId,",
  "claim_number: input.claimNumber || undefined",
  "detectMaintenanceWarrantyFromWorkOrder({\n        operating_company_id: input.companyId,\n        work_order_id: input.workOrderId,",
  "createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...claimDraft } })",
  "fileMutation.mutate({ id: fileTarget.id, companyId, generation: actionGenerationRef.current, claimNumber: fileClaimNumber })",
  "detectMutation.mutate({ companyId, generation: actionGenerationRef.current, workOrderId: detectWoId })",
  "actionGenerationRef.current += 1",
  "createMutation.reset()",
  "fileMutation.reset()",
  "detectMutation.reset()",
  "const claims = claimsQ.isError ? [] : (claimsQ.data?.rows ?? [])",
  "if (!claimsQ.isError) return;",
  "disabled={!companyId || claimsQ.isError}",
  "enabled={!claimsQ.isError}",
  "disabled={claimsQ.isError || !companyId || !detectWoId.trim() || detectMutation.isPending}",
  "disabled={claimsQ.isError || !claimDraft.part_description.trim() || createMutation.isPending}",
  "disabled={claimsQ.isError || !fileTarget || fileMutation.isPending}",
];

function inspect(value) {
  const failures = tokens.filter((token) => !value.includes(token));
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 3) failures.push("three stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 3) failures.push("three stale errors rejected");
  if ((value.match(/await refresh\(input\.companyId\)/g) ?? []).length < 3) failures.push("three submitted-company refreshes");
  return failures;
}

const auditEvents = [
  "maintenance.parts_warranty.created",
  "maintenance.warranty_claim.created",
  "maintenance.warranty_claim.updated",
  "maintenance.warranty_claim.filed",
  "maintenance.warranty_claim.reimbursed",
  "maintenance.warranty_claim.archived",
  "maintenance.warranty_detected_from_wo",
];

function inspectBackend(value) {
  const failures = [];
  for (const event of auditEvents) {
    const eventIndex = value.indexOf(`\"${event}\"`);
    if (eventIndex < 0) {
      failures.push(`missing ${event} audit`);
      continue;
    }
    const auditPayload = value.slice(eventIndex, eventIndex + 420);
    if (!auditPayload.includes("operating_company_id:")) {
      failures.push(`${event} audit omits operating_company_id`);
    }
  }
  return failures;
}

const failures = [...inspect(source), ...inspectBackend(backendSource)];
if (failures.length) {
  console.error(`verify-maint-warranty-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const frontendMutations = tokens.slice(2);
  for (const token of frontendMutations) {
    if (inspect(source.replace(token, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  for (const event of auditEvents) {
    const eventIndex = backendSource.indexOf(`\"${event}\"`);
    const companyIndex = backendSource.indexOf("operating_company_id:", eventIndex);
    const planted = `${backendSource.slice(0, companyIndex)}PLANTED_COMPANY_SCOPE:${backendSource.slice(companyIndex + "operating_company_id:".length)}`;
    if (inspectBackend(planted).length === 0) throw new Error(`selftest missed ${event} tenantless audit`);
  }
  const mutationCount = frontendMutations.length + auditEvents.length;
  console.log(`verify-maint-warranty-company-lifecycle --selftest PASS (${mutationCount}/${mutationCount} planted defects red)`);
  process.exit(0);
}
console.log("verify-maint-warranty-company-lifecycle PASS — create/file/detect preserve submitted company, claim, draft, work-order state, and tenant-scoped audits");
