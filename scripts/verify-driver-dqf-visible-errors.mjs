#!/usr/bin/env node
/** DRV-F6331 — Driver DQF create/status writes must surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[mutationError, setMutationError\]/.test(text), "mutation error state required");
  need(/const createMutation[\s\S]*?onError: \(error\)[\s\S]*?Failed to create DQF item/.test(text), "create failure must be visible");
  need(/const patchMutation[\s\S]*?onError: \(error\)[\s\S]*?Failed to update DQF item/.test(text), "status failure must be visible");
  need((text.match(/onMutate: \(\) => setMutationError\(null\)/g) ?? []).length === 2, "both writes must clear stale errors");
  need(/role="alert"[\s\S]*?\{mutationError\}/.test(text), "mutation error must render accessibly");
  need((text.match(/error instanceof Error \? error\.message/g) ?? []).length === 2, "both writes must preserve backend detail");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-driver-dqf-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to create DQF item"\),/, ""),
    source.replace(/\n    onError: \(error\) => setMutationError\(error instanceof Error \? error\.message : "Failed to update DQF item"\),/, ""),
    source.replace(/\n      \{mutationError \? \([\s\S]*?\n      \) : null\}/, ""),
    source.replaceAll("onMutate: () => setMutationError(null)", ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-dqf-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-dqf-visible-errors PASS — DQF write failures are visible");
