#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","reverse_link"],"leafRe":"^arriving_soon\\.convert_to_wo$","task":"MAINT-F6509-CONVERT-ISSUE-WO-DRAFT-LIFECYCLE"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["reset only while the creator is open", input.includes("if (!open) return;")],
    ["restore the card suggestion", input.includes("setSourceType(suggested);")],
    ["clear free-text notes", input.includes('setNotes("");')],
    [
      "reset on open, company, issue, or suggestion change",
      input.includes("[open, operatingCompanyId, selectedIssueId, suggested]"),
    ],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleNotes = source.replace('setNotes("");', "void notes;");
  const staleCompany = source.replace(
    "[open, operatingCompanyId, selectedIssueId, suggested]",
    "[open, selectedIssueId, suggested]",
  );
  const checks = [
    failures(staleNotes).includes("clear free-text notes"),
    failures(staleCompany).includes("reset on open, company, issue, or suggestion change"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-maint-convert-issue-wo-draft-lifecycle selftest PASS — 2/2 stale-draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-maint-convert-issue-wo-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maint-convert-issue-wo-draft-lifecycle PASS — nested WO creator resets per open/company/issue");
