#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx";
const source = fs.readFileSync(FILE, "utf8");
const backendSource = fs.readFileSync("apps/backend/src/maintenance/defects.routes.ts", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/triageMaintenanceDvirDefect\(input\.id,[\s\S]*operating_company_id: input\.companyId[\s\S]*action: input\.action/, "triage does not use immutable defect/company/action"],
    [/input\.generation !== actionGenerationRef\.current/, "stale success is not rejected"],
    [/input\.generation === actionGenerationRef\.current/, "stale error can leak"],
    [/queryKey: \["maintenance", "dvir-defects", input\.companyId\]/, "refresh is not pinned to submitted company"],
    [/actionGenerationRef\.current \+= 1[\s\S]*triageMut\.reset\(\)[\s\S]*\[operatingCompanyId\]/, "company transition does not reset action state"],
    [/companyId: operatingCompanyId[\s\S]*generation: actionGenerationRef\.current/, "row action does not snapshot company/generation"],
    [/runTriage\(row\.id, "assign"\)[\s\S]*runTriage\(row\.id, "escalate"\)[\s\S]*runTriage\(row\.id, "convert_to_wo"\)/, "all mounted actions must use the guarded submitter"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

function inspectBackend(value) {
  const failures = [];
  const auditBaseStart = value.indexOf("const auditBase = {");
  if (auditBaseStart < 0) failures.push("missing shared triage audit base");
  else if (!value.slice(auditBaseStart, auditBaseStart + 520).includes("operating_company_id: body.data.operating_company_id")) {
    failures.push("triage audit base omits submitted company");
  }
  for (const event of ["assigned", "escalated", "closed_no_action", "converted_to_wo"]) {
    if (!value.includes(`${TRIAGE_PREFIX}${event}`)) failures.push(`missing ${event} audit`);
  }
  return failures;
}

const TRIAGE_PREFIX = "${TRIAGE_EVENT_PREFIX}";

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.id", "row.id"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["triageMut.reset();", "// planted: state survives"],
    ["companyId: operatingCompanyId", "companyId: ''"],
    ['runTriage(row.id, "convert_to_wo")', 'triageMut.mutate({ id: row.id, action: "convert_to_wo" })'],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  const companyToken = "operating_company_id: body.data.operating_company_id";
  if (!backendSource.includes(companyToken)) throw new Error(`selftest fixture missing: ${companyToken}`);
  if (inspectBackend(backendSource.replace(companyToken, "PLANTED_SCOPE: body.data.operating_company_id")).length === 0) {
    throw new Error("selftest missed tenantless triage audits");
  }
  console.log(`verify-maint-defects-inbox-action-lifecycle --selftest PASS (${mutations.length + 1}/${mutations.length + 1})`);
  process.exit(0);
}

const failures = [...inspect(source), ...inspectBackend(backendSource)];
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-defects-inbox-action-lifecycle PASS — inbox triage actions remain company-local");
