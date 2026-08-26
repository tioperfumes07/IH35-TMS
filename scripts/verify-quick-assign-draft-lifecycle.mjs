#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet"],"cols":["driver","unit","trailer","connectivity","reverse_link"],"leaves":["dispatch.modal.quick_assign","unit.profile.quick_assign","fleet.modal.quick_assign"],"task":"CLASS-F6513-QUICK-ASSIGN-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  dispatch: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  fleet: "apps/frontend/src/components/fleet/QuickAssignModal.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];
  const dispatchReset = input.dispatch.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  for (const token of ['setDriverId("")', "setDriverOption(null)", 'setUnitId("")', "setUnitOption(null)", 'setTrailerId("")', "setTrailerOption(null)", "setAckAll(false)"]) {
    if (!dispatchReset.includes(token)) out.push(`dispatch reset ${token}`);
  }
  if (!/\[open, operatingCompanyId, loadId, resetDraft\]/.test(input.dispatch)) out.push("dispatch reset keyed by company/load/open");
  if (!/const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input.dispatch)) out.push("dispatch dismiss resets");
  if (!input.dispatch.includes('<Modal open={open} onClose={handleClose}')) out.push("dispatch modal uses reset close");
  if (!/variant="secondary" onClick=\{handleClose\}/.test(input.dispatch)) out.push("dispatch close button resets");
  if (!/await onSubmit\([\s\S]*?handleClose\(\);/.test(input.dispatch)) out.push("dispatch success resets");

  const fleetReset = input.fleet.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  if (!fleetReset.includes('setDriverId("")') || !fleetReset.includes("setError(null)")) out.push("fleet resets driver and error");
  if (!/\[open, companyId, target\?\.equipmentId, resetDraft\]/.test(input.fleet)) out.push("fleet reset keyed by company/equipment/open");
  if (!/const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input.fleet)) out.push("fleet dismiss resets");
  if (!input.fleet.includes('<Modal open={open} onClose={handleClose}')) out.push("fleet modal uses reset close");
  if (!/await onConfirm\(driverId\);\s*handleClose\(\);/.test(input.fleet)) out.push("fleet success resets");
  return out;
}

if (process.argv.includes("--selftest")) {
  const staleTrailer = { ...source, dispatch: source.dispatch.replace("setTrailerId(\"\");", "void trailerId;") };
  const staleLoad = { ...source, dispatch: source.dispatch.replace("[open, operatingCompanyId, loadId, resetDraft]", "[open, operatingCompanyId, resetDraft]") };
  const staleEquipment = { ...source, fleet: source.fleet.replace("[open, companyId, target?.equipmentId, resetDraft]", "[open, companyId, resetDraft]") };
  const checks = [
    failures(staleTrailer).includes('dispatch reset setTrailerId("")'),
    failures(staleLoad).includes("dispatch reset keyed by company/load/open"),
    failures(staleEquipment).includes("fleet reset keyed by company/equipment/open"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-quick-assign-draft-lifecycle selftest PASS — 3/3 stale assignment mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-quick-assign-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-quick-assign-draft-lifecycle PASS — Dispatch/Fleet Quick Assign drafts reset per load/equipment/company/open cycle");
