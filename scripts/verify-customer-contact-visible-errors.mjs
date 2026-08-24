#!/usr/bin/env node
/** CUST-F6326 — Every customer-contact mutation must surface its API failure. */
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
  const create = block(text, "const createContactMutation", "const updateContactMutation");
  const update = block(text, "const updateContactMutation", "const deactivateContactMutation");
  const deactivate = block(text, "const deactivateContactMutation", "const reactivateContactMutation");
  const reactivate = block(text, "const reactivateContactMutation", "const createQualityEventMutation");
  need(/onError: \(error\)[\s\S]*Failed to add contact/.test(create), "create contact failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to update contact/.test(update), "update contact failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to deactivate contact/.test(deactivate), "deactivate contact failure must be visible");
  need(/onError: \(error\)[\s\S]*Failed to reactivate contact/.test(reactivate), "reactivate contact failure must be visible");
  need((text.match(/error instanceof Error \? error\.message/g) ?? []).length >= 4, "contact failures must preserve backend detail");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-customer-contact-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to add contact", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to update contact", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to deactivate contact", "error"\),/, ""),
    source.replace(/\n    onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to reactivate contact", "error"\),/, ""),
    source.replaceAll("error instanceof Error ? error.message", '"Request failed"'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-customer-contact-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-customer-contact-visible-errors PASS — all contact mutation failures are visible");
