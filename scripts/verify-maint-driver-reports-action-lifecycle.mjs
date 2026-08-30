#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company generation"],
    [/updateDriverReportStatus\(input\.id,[\s\S]*operating_company_id: input\.companyId[\s\S]*status: input\.status[\s\S]*resolution_notes: input\.resolutionNotes/, "update does not use immutable report/company/status/notes"],
    [/input\.generation !== actionGenerationRef\.current/, "stale success is not rejected"],
    [/input\.generation === actionGenerationRef\.current/, "stale error can leak"],
    [/queryKey: \["maintenance", "driver-reports", input\.companyId\]/, "refresh is not pinned to submitted company"],
    [/delete next\[input\.id\]/, "submitted report draft is not cleared exactly"],
    [/actionGenerationRef\.current \+= 1[\s\S]*mut\.reset\(\)[\s\S]*setResolutionDraft\(\{\}\)[\s\S]*\[operatingCompanyId\]/, "company transition does not reset action and draft state"],
    [/companyId: operatingCompanyId[\s\S]*generation: actionGenerationRef\.current[\s\S]*resolutionNotes: resolutionDraft\[id\]/, "row action does not snapshot company/generation/notes"],
    [/updateReport\(row\.id, "under_review"\)[\s\S]*updateReport\(row\.id, "resolved"\)[\s\S]*updateReport\(row\.id, "dismissed"\)/, "all mounted actions must use the guarded submitter"],
    [/import \{ humanizeEnumLabel \} from "\.\.\/\.\.\/lib\/humanizeEnumLabel"/, "shared enum label boundary missing"],
    [/key: "report_type"[\s\S]{0,180}render: \(row\) => humanizeEnumLabel\(row\.report_type\)/, "report type leaks its persisted machine key"],
    [/key: "status"[\s\S]{0,180}render: \(row\) => humanizeEnumLabel\(row\.status\)/, "report status leaks its persisted machine key"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.id", "row.id"],
    ["input.generation !== actionGenerationRef.current", "false"],
    ["input.generation === actionGenerationRef.current", "true"],
    ["mut.reset();", "// planted: state survives"],
    ["delete next[input.id];", "// planted: draft survives"],
    ["companyId: operatingCompanyId", "companyId: ''"],
    ['updateReport(row.id, "dismissed")', 'mut.mutate({ id: row.id, status: "dismissed" })'],
    ["humanizeEnumLabel(row.report_type)", "row.report_type"],
    ["humanizeEnumLabel(row.status)", "row.status"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-driver-reports-action-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-driver-reports-action-lifecycle PASS — report actions remain company-local");
