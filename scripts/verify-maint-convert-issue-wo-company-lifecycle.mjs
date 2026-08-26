#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","dispatch"],"cols":["work_order","load","unit","driver","connectivity","reverse_link"],"leaves":["arriving_soon.convert_to_wo","maintenance.modal.convert_issue_to_wo"],"task":"MAINT-F6608-CONVERT-ISSUE-WO-COMPANY-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const submitGenerationRef = useRef\(0\)/, "submit generation exists"],
  [/submitGenerationRef\.current \+= 1;\s*mutation\.reset\(\);\s*setSourceType\(suggested\);\s*setNotes\(""\);/, "scope/open change retires request and resets draft"],
  [/mutationFn: \(input: \{[\s\S]*loadId: string;[\s\S]*companyId: string;[\s\S]*issueId: string;[\s\S]*sourceType:[\s\S]*notes: string;[\s\S]*generation: number;[\s\S]*\}\) => convertIssueToWo\(input\.loadId, input\.companyId/, "write receives immutable scope and draft"],
  [/issue_id: input\.issueId,\s*wo_source_type: input\.sourceType,\s*additional_notes: input\.notes \|\| undefined/, "submitted issue/source/notes reach canonical write"],
  [/onSuccess: \(payload, input\) => \{\s*if \(input\.generation !== submitGenerationRef\.current\) return;/, "stale success is rejected"],
  [/onError: \(error, input\) => \{\s*if \(input\.generation !== submitGenerationRef\.current\) return;/, "stale failure is rejected"],
  [/mutation\.mutate\(\{\s*loadId: String\(card\.load_id\),\s*companyId: operatingCompanyId,\s*issueId: selectedIssueId,\s*sourceType,\s*notes,\s*generation: submitGenerationRef\.current,\s*\}\)/, "submit snapshots complete modal state"],
  [/kind="unit" id=\{card\.unit_id\}[\s\S]*kind="driver" id=\{card\.driver_id\}[\s\S]*kind="load" id=\{card\.load_id\}/, "unit driver and load drills remain mounted"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maint-convert-issue-wo-company-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maint-convert-issue-wo-company-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-convert-issue-wo-company-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}
console.log(`verify-maint-convert-issue-wo-company-lifecycle PASS — ${checks.length} immutable conversion invariants`);
