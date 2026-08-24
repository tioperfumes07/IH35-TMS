#!/usr/bin/env node
/** CUST-F6327 — Customer quality-event void/update mutations must surface API failures. */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/CustomerDetail.tsx";
const source = fs.readFileSync(FILE, "utf8");

function block(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  return from >= 0 && to > from ? text.slice(from, to) : "";
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  const voidBlock = block(text, "const voidQualityEventMutation", "const updateQualityEventMutation");
  const updateBlock = block(text, "const updateQualityEventMutation", "const createLaneMutation");
  need(/onError: \(error\)[\s\S]*Failed to void quality event/.test(voidBlock), "void quality-event failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to update quality event/.test(updateBlock), "update quality-event failure must be visible");
  need((voidBlock.match(/error instanceof Error \? error\.message/g) ?? []).length === 1, "void must preserve backend error detail");
  need((updateBlock.match(/error instanceof Error \? error\.message/g) ?? []).length === 1, "update must preserve backend error detail");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-customer-quality-event-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to void quality event", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to update quality event", "error"\),/, ""),
    source.replace('error instanceof Error ? error.message : "Failed to void quality event"', '"Request failed"'),
    source.replace('error instanceof Error ? error.message : "Failed to update quality event"', '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-customer-quality-event-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-customer-quality-event-visible-errors PASS — void/update failures are visible");
