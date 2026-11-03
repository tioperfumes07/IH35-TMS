#!/usr/bin/env node
/**
 * U12 — POD review status filter is MultiSelectDropdown + backend status[] via statusListParam.
 */
import fs from "node:fs";

const LABEL = "verify-pod-review-status-multiselect";
const PAGE = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";
const API = "apps/frontend/src/api/dispatch.ts";
const ROUTES = "apps/backend/src/dispatch/pod.routes.ts";

const page = fs.readFileSync(PAGE, "utf8");
const api = fs.readFileSync(API, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");
const fails = [];

if (!/MultiSelectDropdown/.test(page)) fails.push(`${PAGE}: must use MultiSelectDropdown`);
if (!/statusOptions\(/.test(page)) fails.push(`${PAGE}: must use statusOptions`);
if (!/data-testid="pod-status-filter"/.test(page)) fails.push(`${PAGE}: missing pod-status-filter`);
if (/SelectCombobox/.test(page)) fails.push(`${PAGE}: must not use SelectCombobox for status`);
if (!/useState<string\[\]>\(\["pending_review"\]\)/.test(page)) {
  fails.push(`${PAGE}: statusFilter must be string[] defaulting to pending_review`);
}
if (!/appendStatusList\(params, "status"/.test(api)) {
  fails.push(`${API}: getPodDocuments must appendStatusList for status`);
}
if (!/statusListParam\(POD_LIST_STATUSES\)/.test(routes) && !/statusListParam\(\["pending_review"/.test(routes)) {
  fails.push(`${ROUTES}: list query must use statusListParam`);
}
if (!/statusListCondition\("p\.status"/.test(routes)) {
  fails.push(`${ROUTES}: list query must use statusListCondition on p.status`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = page.replace(/MultiSelectDropdown/g, "SelectCombobox");
  if (!/SelectCombobox/.test(plant) || /MultiSelectDropdown/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — POD review status is multi-select`);
