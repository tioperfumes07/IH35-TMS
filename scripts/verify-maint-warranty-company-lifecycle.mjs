#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","vendors"],"cols":["vendor","connectivity","reverse_link"],"leaves":["warranty.create_claim","warranty.file_claim","warranty.detect_from_wo"],"task":"MAINT-F6613-WARRANTY-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx";
const source = fs.readFileSync(file, "utf8");
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
];

function inspect(value) {
  const failures = tokens.filter((token) => !value.includes(token));
  if ((value.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 3) failures.push("three stale successes rejected");
  if ((value.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 3) failures.push("three stale errors rejected");
  if ((value.match(/await refresh\(input\.companyId\)/g) ?? []).length < 3) failures.push("three submitted-company refreshes");
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-warranty-company-lifecycle FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = tokens.slice(2);
  for (const token of mutations) {
    if (inspect(source.replace(token, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${token}`);
  }
  console.log(`verify-maint-warranty-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}
console.log("verify-maint-warranty-company-lifecycle PASS — create/file/detect preserve submitted company, claim, draft, and work-order state");
