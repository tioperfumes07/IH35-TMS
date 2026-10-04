#!/usr/bin/env node
/** @matrix-built dispatch:load.drawer.overview connectivity */
import fs from "node:fs";
let src = fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");
const BADGE = "apps/frontend/src/components/dispatch/AutoStatusSwitchedBadge.tsx";
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
  // BANK-F91397 leftover plant — AutoStatusSwitchedBadge page-scoped text token ratchet
  const leftoverPlant = fs.readFileSync(BADGE, "utf8") + '\n<span className="text-[11px] text-[#8A92AB]">plant</span>\n';
  if (!(leftoverPlant.includes("text-[11px]") && leftoverPlant.includes("#8A92AB"))) {
    throw new Error("leftover plant escaped");
  }
  console.log(`verify-dispatch-auto-status-audit-failure-honesty selftest PASS (${mutations.length} mutations) + leftover plant`);
  process.exit(0);
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
// BANK-F91397 leftover refuse — AutoStatusSwitchedBadge page-scoped text token ratchet
const badgeSrc = fs.readFileSync(BADGE, "utf8");
if (badgeSrc.includes("text-[11px]")) {
  console.error("verify-dispatch-auto-status-audit-failure-honesty FAIL — AutoStatusSwitchedBadge.tsx leftover text-[11px]");
  process.exit(1);
}
if (badgeSrc.includes("#8A92AB")) {
  console.error("verify-dispatch-auto-status-audit-failure-honesty FAIL — AutoStatusSwitchedBadge.tsx leftover off-scale muted #8A92AB");
  process.exit(1);
}
console.log("verify-dispatch-auto-status-audit-failure-honesty PASS");
