#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","customer","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.complaints.list","safety.modal.complaint_create","safety.modal.complaint_void"],"task":"CLASS-F6544-COMPLAINT-ACTIONS-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
const BACKEND_FILE = "apps/backend/src/routes/safety/complaints.ts";
const backendSource = fs.readFileSync(BACKEND_FILE, "utf8");
function inspect(source, backend = backendSource) {
  const errors = [];
  if (!/useEffect\(\(\) => \{[\s\S]*createMutation\.reset\(\)[\s\S]*patchMutation\.reset\(\)[\s\S]*voidMutation\.reset\(\)[\s\S]*setForm\(EMPTY_COMPLAINT_FORM\)[\s\S]*setComplaintTypeSearch\(""\)[\s\S]*setVoidTargetId\(null\)[\s\S]*\}, \[companyId\]\)/.test(source)) errors.push("company transition does not reset create/resolve/void state");
  if (!/createComplaintV64\(input\.companyId, input\.payload\)/.test(source)) errors.push("create does not snapshot company and payload");
  if (!/patchComplaintV64\(input\.companyId, input\.id, \{ status: input\.status \}\)/.test(source)) errors.push("resolve does not snapshot company/id/status");
  if (!/voidComplaintV64\(input\.companyId, input\.id, input\.reason\)/.test(source)) errors.push("void does not snapshot company/id/reason");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 3) errors.push("all three success paths must reject stale company responses");
  if (!source.includes('["safety-v64", "complaints", input.companyId]')) errors.push("success refresh is not pinned to submitting company");
  if (!/buildComplaintPayload\(\)[\s\S]*complainant_type:[\s\S]*respondent_type:[\s\S]*complaint_type_id:[\s\S]*summary:[\s\S]*severity:/.test(source)) errors.push("creator does not snapshot complete base payload");
  for (const kind of ["driver", "customer", "user"]) if (!source.includes(`kind="${kind}"`)) errors.push(`${kind} forward/reverse link removed`);
  if (!source.includes("<DriverPickerWithCreate") || !source.includes("allowCreate")) errors.push("canonical nested creators removed");
  if (!/const createErrorCurrent =[\s\S]*createMutation\.isError[\s\S]*createMutation\.variables\?\.companyId === companyId[\s\S]*createMutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(source)) errors.push("create rejection is not company-generation scoped");
  if (!/const patchErrorCurrent =[\s\S]*patchMutation\.isError[\s\S]*patchMutation\.variables\?\.companyId === companyId[\s\S]*patchMutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(source)) errors.push("resolve rejection is not company-generation scoped");
  if (!/\{createErrorCurrent \? \([\s\S]*Could not file complaint/.test(source)) errors.push("create banner does not use current-generation predicate");
  if (!/\{patchErrorCurrent \? \([\s\S]*complaint-resolve-error/.test(source)) errors.push("resolve banner does not use current-generation predicate");
  for (const event of ["filed", "status_changed", "resolved", "voided"]) {
    const pattern = new RegExp(`"safety\\.complaint\\.${event}",[\\s\\S]{0,240}operating_company_id: query\\.data\\.operating_company_id`);
    if (!pattern.test(backend)) errors.push(`${event} audit does not identify the operating company`);
  }
  return errors;
}
if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("createMutation.reset();", "// planted: create survives"),
    source.replace("createComplaintV64(input.companyId, input.payload)", "createComplaintV64(companyId, input.payload)"),
    source.replace("patchComplaintV64(input.companyId, input.id, { status: input.status })", "patchComplaintV64(companyId, input.id, { status: input.status })"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("setVoidTargetId(null);", "// planted: void target survives"),
    source.replace("createMutation.variables?.companyId === companyId", "true"),
    source.replace("patchMutation.variables?.generation === lifecycleGenerationRef.current", "true"),
    source.replace("{createErrorCurrent ? (", "{createMutation.isError ? ("),
    source.replace("{patchErrorCurrent ? (", "{patchMutation.isError ? ("),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-complaints-actions-company-lifecycle SELFTEST FAIL — ${missed.length}/9 mutation(s) survived`);
    process.exit(1);
  }
  for (const event of ["filed", "status_changed", "resolved", "voided"]) {
    const eventBlock = new RegExp(`("safety\\.complaint\\.${event}",[\\s\\S]{0,240})operating_company_id: query\\.data\\.operating_company_id,`);
    const mutatedBackend = backendSource.replace(eventBlock, "$1");
    if (mutatedBackend === backendSource || inspect(source, mutatedBackend).length === 0) throw new Error(`missed ${event} audit mutation`);
  }
  console.log("verify-complaints-actions-company-lifecycle selftest PASS — 13/13 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-complaints-actions-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-complaints-actions-company-lifecycle PASS — complaint actions are company-local");
