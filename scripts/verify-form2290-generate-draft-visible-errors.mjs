#!/usr/bin/env node
/** COMP-F6338 — Form 2290 draft generation must surface rejected writes. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[generateError, setGenerateError\]/.test(text), "generate error state required");
  need(/const generateMutation = useMutation[\s\S]*onMutate: \(\) => setGenerateError\(null\)/.test(text), "each attempt must clear stale error");
  need(/const generateMutation = useMutation[\s\S]*onError: \(error\)[\s\S]*Failed to generate Form 2290 draft/.test(text), "draft failure must be captured");
  need(/role="alert"[\s\S]*\{generateError\}/.test(text), "draft failure must render accessibly");
  need(/error instanceof Error \? error\.message/.test(text), "backend error detail must be preserved");
  need(/disabled=\{generateMutation\.isPending\}/.test(text), "duplicate draft attempts must remain disabled");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-form2290-generate-draft-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\)[\s\S]*?Form 2290 draft"\),/, ""),
    source.replace(/\n    onMutate: \(\) => setGenerateError\(null\),/, ""),
    source.replace(/\n      \{generateError \? \([\s\S]*?\n      \) : null\}/, ""),
    source.replace("error instanceof Error ? error.message", '"Request failed"'),
    source.replace("disabled={generateMutation.isPending}", "disabled={false}"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-form2290-generate-draft-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-form2290-generate-draft-visible-errors PASS — draft generation failures are visible");
