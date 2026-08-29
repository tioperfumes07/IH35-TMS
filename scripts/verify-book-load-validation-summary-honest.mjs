#!/usr/bin/env node
import fs from "node:fs";

const modal = fs.readFileSync("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", "utf8");
const summary = fs.readFileSync("apps/frontend/src/pages/dispatch/components/BookLoadValidationSection.tsx", "utf8");
const selftest = process.argv.includes("--selftest");

function problems(files) {
  const failures = [];
  const stateCounts = {
    live: (files.modal.match(/state: "live" as const/g) ?? []).length,
    pending: (files.modal.match(/state: "pending" as const/g) ?? []).length,
    onSave: (files.modal.match(/state: "on_save" as const/g) ?? []).length,
  };
  if (stateCounts.live !== 2 || stateCounts.pending !== 3 || stateCounts.onSave !== 2) {
    failures.push(`validation states must remain 2 live / 3 pending / 2 on-save, got ${stateCounts.live}/${stateCounts.pending}/${stateCounts.onSave}`);
  }
  for (const token of [
    'state: "live" as const',
    'state: "pending" as const',
    'state: "on_save" as const',
    'code: "authorization required"',
    'code: "not automated"',
    'code: "on save"',
    "<BookLoadValidationSection checks={validationChecks}",
  ]) if (!files.modal.includes(token)) failures.push(`BookLoadModalV4 missing ${token}`);
  for (const token of [
    'state: "live" | "pending" | "on_save"',
    'check.state === "live"',
    'check.state === "pending"',
    'aria-label={check.state === "live" ? "Live gate" : check.state === "pending" ? "Not automated" : "Runs on save"}',
    "live gates · {pendingCount} not automated · {onSaveCount} run on save",
  ]) if (!files.summary.includes(token)) failures.push(`BookLoadValidationSection missing ${token}`);
  if (/index\s*</.test(files.summary) || /checks pass/.test(files.summary)) failures.push("validation summary must not infer pass state from position or claim pending work passed");
  return failures;
}

if (selftest) {
  const mutations = [
    { modal: modal.replace('state: "pending" as const', 'state: "live" as const'), summary },
    { modal, summary: summary.replace('aria-label={check.state === "live" ? "Live gate" : check.state === "pending" ? "Not automated" : "Runs on save"}', 'aria-label="Passed"') },
    { modal, summary: summary.replace("live gates · {pendingCount} not automated · {onSaveCount} run on save", "checks pass") },
  ];
  for (const mutant of mutations) {
    if (problems(mutant).length === 0) throw new Error("planted validation-theater regression survived");
  }
  console.log(`verify-book-load-validation-summary-honest SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = problems({ modal, summary });
if (failures.length) {
  console.error(`verify-book-load-validation-summary-honest FAILED:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-book-load-validation-summary-honest PASS");
