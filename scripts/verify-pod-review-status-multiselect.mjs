#!/usr/bin/env node
/**
 * U12 — POD review status filter is MultiSelectDropdown + backend status[] via statusListParam.
 *
 * Codex batch83: --selftest must run planted fixtures through the same validator as scan
 * (failures()), never merely assert the plant string mutated.
 */
import fs from "node:fs";

const LABEL = "verify-pod-review-status-multiselect";
const PAGE = "apps/frontend/src/pages/dispatch/PodReviewPage.tsx";
const API = "apps/frontend/src/api/dispatch.ts";
const ROUTES = "apps/backend/src/dispatch/pod.routes.ts";

export function failures({ page, api, routes }) {
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
  return fails;
}

const live = {
  page: fs.readFileSync(PAGE, "utf8"),
  api: fs.readFileSync(API, "utf8"),
  routes: fs.readFileSync(ROUTES, "utf8"),
};

if (process.argv.includes("--selftest")) {
  const clean = failures(live);
  if (clean.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${clean.join("\n  ")}`);
    process.exit(1);
  }
  const plantedPage = live.page.replace(/MultiSelectDropdown/g, "SelectCombobox");
  const planted = failures({ ...live, page: plantedPage });
  if (!planted.some((f) => f.includes("MultiSelectDropdown") || f.includes("SelectCombobox"))) {
    console.error(`${LABEL} --selftest FAIL: planted page escaped failures()`);
    process.exit(1);
  }
  const plantedApi = live.api.replace(/appendStatusList\(params, "status"/g, 'params.set("status"');
  if (!failures({ ...live, api: plantedApi }).some((f) => f.includes("appendStatusList"))) {
    console.error(`${LABEL} --selftest FAIL: planted api escaped failures()`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = failures(live);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — POD review status is multi-select`);
