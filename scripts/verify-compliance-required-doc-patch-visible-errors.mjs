#!/usr/bin/env node
/** COMP-F6337 — Required-document toggle/deactivate writes must surface failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/compliance/RequiredDocumentsSection.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[patchError, setPatchError\]/.test(text), "patch error state required");
  need(/const patch = useMutation[\s\S]*onMutate: \(\) => setPatchError\(null\)/.test(text), "patch attempt must clear stale error");
  need(/const patch = useMutation[\s\S]*onError: \(error\)[\s\S]*Failed to update required document/.test(text), "patch failure must be visible");
  need(/role="alert"[\s\S]*\{patchError\}/.test(text), "patch error must render accessibly");
  need(/error instanceof Error \? error\.message/.test(text), "backend detail must be preserved");
  need(/is_active: false/.test(text) && !/deleteRequiredDocument/.test(text), "deactivate must remain void-not-delete");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-compliance-required-doc-patch-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setPatchError\(error instanceof Error \? error\.message : "Failed to update required document"\),/, ""),
    source.replace(/\n    onMutate: \(\) => setPatchError\(null\),/, ""),
    source.replace(/\n      \{patchError \? <p role="alert"[^\n]+/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
    source.replace("is_active: false", "is_active: true"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-compliance-required-doc-patch-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-compliance-required-doc-patch-visible-errors PASS — patch failures visible; deactivate remains non-delete");
