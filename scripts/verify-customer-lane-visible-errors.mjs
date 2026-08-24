#!/usr/bin/env node
/** CUST-F6328 — Customer-lane mutations must surface API failures. */
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
  const create = block(text, "const createLaneMutation", "const updateLaneMutation");
  const update = block(text, "const updateLaneMutation", "const deactivateLaneMutation");
  const deactivate = block(text, "const deactivateLaneMutation", "const openInvoicesForPayment");
  need(/onError: \(error\)[\s\S]*Failed to create lane/.test(create), "create lane failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to update lane/.test(update), "update lane failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to deactivate lane/.test(deactivate), "deactivate lane failure must be visible");
  for (const [name, section] of [["create", create], ["update", update], ["deactivate", deactivate]]) {
    need((section.match(/error instanceof Error \? error\.message/g) ?? []).length === 1, `${name} lane must preserve backend detail`);
  }
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-customer-lane-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to create lane", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to update lane", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to deactivate lane", "error"\),/, ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-customer-lane-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-customer-lane-visible-errors PASS — lane mutation failures are visible");
