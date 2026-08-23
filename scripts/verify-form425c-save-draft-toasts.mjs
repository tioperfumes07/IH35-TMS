#!/usr/bin/env node
/**
 * F425C-SAVE-DRAFT-SILENT — Save Draft wiped form.reportId on list/detail invalidate
 * (buttons died, no toast). History Open with no reporting_month still switched tabs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-save-draft-toasts";
const PAGE = "apps/frontend/src/pages/form425c/Form425CHome.tsx";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("if (detailQuery.isFetching || selectedReport?.id) return")) {
    problems.push(`${PAGE}: must not wipe form while detail is refetching or a report is selected`);
  }
  if (!src.includes('pushToast("Draft saved"')) {
    problems.push(`${PAGE}: manual Save Draft must toast Draft saved`);
  }
  if (!src.includes("Create / Load Draft before saving")) {
    problems.push(`${PAGE}: Save Draft without reportId must toast, not return silently`);
  }
  if (!src.includes("Could not open that report")) {
    problems.push(`${PAGE}: History Open without reporting_month must toast, not silent tab switch`);
  }
  if (!src.includes("Opened report in Form 425C")) {
    problems.push(`${PAGE}: History Open must toast when a report loads`);
  }
  if (!src.includes("Create / Load Draft before generating the filing package")) {
    problems.push(`${PAGE}: Merge Generate without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before importing from Banking")) {
    problems.push(`${PAGE}: Form Import from Banking without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before generating the filing PDF")) {
    problems.push(`${PAGE}: Form Generate PDF without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Create / Load Draft before marking filed")) {
    problems.push(`${PAGE}: Form Mark Filed without reportId must toast, not a dead disabled button`);
  }
  if (!src.includes("Draft saved — generating filing PDF")) {
    problems.push(`${PAGE}: dirty Generate PDF must save first then toast, not silently print a stale PDF`);
  }
  const profiles = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx"), "utf8");
  if (!profiles.includes('bankAccounts: [...draft.bankAccounts, { id: "", label: "", number: "" }]')) {
    problems.push("apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx: Bank Accounts must + Create a new row, not a dead heading with no add");
  }
  return problems;
}

const good = `
  if (detailQuery.isFetching || selectedReport?.id) return;
  pushToast("Create / Load Draft before saving", "error");
  pushToast("Draft saved", "success");
  pushToast("Could not open that report", "error");
  pushToast("Opened report in Form 425C", "success");
  pushToast("Create / Load Draft before generating the filing package", "error");
  pushToast("Create / Load Draft before importing from Banking", "error");
  pushToast("Create / Load Draft before generating the filing PDF", "error");
  pushToast("Create / Load Draft before marking filed", "error");
  pushToast("Draft saved — generating filing PDF", "success");
`;
const bad = `
  if (!detailQuery.data?.report) {
    setForm(emptyForm());
    return;
  }
  onOpen={(id) => { setTab("form"); }}
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 4) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${PAGE} Save Draft / History Open not silent`);
process.exit(0);
