#!/usr/bin/env node
import { emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const sidebar = loadText("apps/frontend/src/components/layout/sidebar-config.ts");
const idMatch = sidebar.match(/SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const allIds = idMatch ? [...idMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

/** Owner-only modules (ELD, USERS) are audited outside the primary navigable modules. */
const OWNER_ONLY_MODULE_IDS = new Set(["eld", "users"]);
const ids = allIds.filter((id) => !OWNER_ONLY_MODULE_IDS.has(id));
// expected is derived dynamically from SIDEBAR_ITEM_IDS so it never needs a manual constant bump
const expected = ids.length;

const failures = [];
if (allIds.length === 0) {
  failures.push("could not parse SIDEBAR_ITEM_IDS from sidebar-config.ts");
}
if (new Set(ids).size !== ids.length) {
  failures.push("sidebar module ids contain duplicates");
}
if (allIds.length - ids.length !== OWNER_ONLY_MODULE_IDS.size) {
  failures.push(`expected ${OWNER_ONLY_MODULE_IDS.size} owner-only modules excluded from primary set`);
}

emitStepResult({
  area: "modules",
  expected,
  checked: ids.length,
  pass_count: failures.length === 0 ? ids.length : 0,
  fail_count: failures.length === 0 ? 0 : ids.length,
  failures,
  status: statusFromFindings(failures),
});
