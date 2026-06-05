#!/usr/bin/env node
import { PASS8_COUNTS, emitStepResult, loadText, statusFromFindings } from "./pass-8-shared.mjs";

const sidebar = loadText("apps/frontend/src/components/layout/sidebar-config.ts");
const idMatch = sidebar.match(/SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const ids = idMatch ? [...idMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

const failures = [];
if (ids.length !== PASS8_COUNTS.modules) {
  failures.push(`expected ${PASS8_COUNTS.modules} modules but found ${ids.length}`);
}
if (new Set(ids).size !== ids.length) {
  failures.push("sidebar module ids contain duplicates");
}

emitStepResult({
  area: "modules",
  expected: PASS8_COUNTS.modules,
  checked: ids.length,
  pass_count: failures.length === 0 ? PASS8_COUNTS.modules : 0,
  fail_count: failures.length === 0 ? 0 : PASS8_COUNTS.modules,
  failures,
  status: statusFromFindings(failures),
});
