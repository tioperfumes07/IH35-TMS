#!/usr/bin/env node
/** DRV-F6330 — Applicant pipeline writes must distinguish failure from settlement. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[mutationError, setMutationError\]/.test(text), "mutation error state required");
  need(/const statusM[\s\S]*?onError: \(error\)[\s\S]*?Failed to update applicant status[\s\S]*?onSettled:/.test(text), "status failure must be visible before settlement");
  need(/const convertM[\s\S]*?onError: \(error\)[\s\S]*?Failed to convert applicant to driver[\s\S]*?onSettled:/.test(text), "conversion failure must be visible before settlement");
  need((text.match(/onMutate: \(\) => setMutationError\(null\)/g) ?? []).length === 2, "both writes must clear stale errors");
  need(/role="alert"[\s\S]*?\{mutationError\}/.test(text), "mutation error must render accessibly");
  need((text.match(/error instanceof Error \? error\.message/g) ?? []).length >= 2, "backend details must be preserved");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-driver-applicant-mutation-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to update applicant status"\),/, ""),
    source.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to convert applicant to driver"\),/, ""),
    source.replace(/\n      \{mutationError \? \([\s\S]*?\n      \) : null\}/, ""),
    source.replaceAll("onMutate: () => setMutationError(null)", ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-applicant-mutation-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-applicant-mutation-errors PASS — pipeline write failures are visible");
