#!/usr/bin/env node
/** @matrix-built dispatch:load.drawer.overview connectivity */
import fs from "node:fs";
let src = fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");
function failures() {
  const out = [];
  if (!/autoStatusSwitchQuery\.isError \? \(/.test(src)) out.push("failed provenance read must have an explicit branch");
  if (!/Auto-status audit unavailable/.test(src)) out.push("failed provenance read must be named");
  if (!/onClick=\{\(\) => void autoStatusSwitchQuery\.refetch\(\)\}/.test(src)) out.push("failure must retry exact query");
  if (!/autoStatusSwitchForLoad \? \([\s\S]{0,220}<AutoStatusSwitchedBadge/.test(src)) out.push("successful provenance badge must remain mounted");
  return out;
}
if (process.argv.includes("--selftest")) {
  const original = src;
  const mutations = [
    ["autoStatusSwitchQuery.isError ? (", "false ? ("],
    ["Auto-status audit unavailable", "Status"],
    ["autoStatusSwitchQuery.refetch()", "Promise.resolve()"],
    ["<AutoStatusSwitchedBadge", "<span"],
  ];
  for (const [from, to] of mutations) {
    src = original.replace(from, to);
    if (failures().length === 0) throw new Error(`selftest mutation escaped: ${from}`);
  }
  console.log(`verify-dispatch-auto-status-audit-failure-honesty selftest PASS (${mutations.length} mutations)`);
  process.exit(0);
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
console.log("verify-dispatch-auto-status-audit-failure-honesty PASS");
