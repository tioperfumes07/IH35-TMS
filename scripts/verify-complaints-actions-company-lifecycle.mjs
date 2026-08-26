#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","customer","connectivity","reverse_link","qbo_chrome"],"leaves":["safety.complaints.list","safety.modal.complaint_create","safety.modal.complaint_void"],"task":"CLASS-F6544-COMPLAINT-ACTIONS-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";
function inspect(source) {
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
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-complaints-actions-company-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-complaints-actions-company-lifecycle selftest PASS — 5/5 planted defects rejected");
  process.exit(0);
}
const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-complaints-actions-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-complaints-actions-company-lifecycle PASS — complaint actions are company-local");
