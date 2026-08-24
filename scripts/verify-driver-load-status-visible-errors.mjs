#!/usr/bin/env node
/** DRV-F6329 — Driver load-status catalog mutations must surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/DriverLoadStatusesPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function block(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  return from >= 0 && to > from ? text.slice(from, to) : "";
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  const create = block(text, "const createMutation", "const updateMutation");
  const update = block(text, "const updateMutation", "const statuses = useMemo");
  need(/onError: \(error\)[\s\S]*Failed to create driver load status/.test(create), "create failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to update driver load status/.test(update), "update failure must be visible");
  need((create.match(/error instanceof Error \? error\.message/g) ?? []).length === 1, "create must preserve backend detail");
  need((update.match(/error instanceof Error \? error\.message/g) ?? []).length === 1, "update must preserve backend detail");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-driver-load-status-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to create driver load status", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to update driver load status", "error"\),/, ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-load-status-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-load-status-visible-errors PASS — catalog mutation failures are visible");
