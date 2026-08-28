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
  if (!/const handleClose = useCallback\(\(\) => \{\s*if \(loading\) return;\s*resetDraft\(\);\s*onClose\(\);/.test(input.dispatch)) out.push("dispatch dismiss resets");
  if (!input.dispatch.includes('<Modal open={open} onClose={handleClose}')) out.push("dispatch modal uses reset close");
  if (!/variant="secondary" onClick=\{handleClose\}/.test(input.dispatch)) out.push("dispatch close button resets");
  if (!/await submittedOnSubmit\(submittedPayload\)[\s\S]*?handleClose\(\);/.test(input.dispatch)) out.push("dispatch success resets");
  if (!/const scopeGenerationRef = useRef\(0\)/.test(input.dispatch)) out.push("dispatch owns scope generation");
  if (!/scopeGenerationRef\.current \+= 1;[\s\S]{0,80}setLoading\(false\)/.test(input.dispatch)) out.push("dispatch scope transition retires pending write");
  if (!/if \(loading\) return;[\s\S]{0,100}resetDraft\(\)/.test(input.dispatch)) out.push("dispatch pending dismissal locked");
  if (!/const submittedPayload = \{[\s\S]*driver_id: driverId[\s\S]*unit_id: unitId[\s\S]*trailer_id: trailerId[\s\S]*acknowledged_warnings: ackAll \? \[\.\.\.hardWarnings\]/.test(input.dispatch)) out.push("dispatch submit snapshots assignment draft");
  if (!/await submittedOnSubmit\(submittedPayload\);[\s\S]{0,100}scopeGenerationRef\.current !== submittedGeneration[\s\S]{0,80}handleClose\(\)/.test(input.dispatch)) out.push("dispatch success rejects stale load before close");
  if (!/scopeGenerationRef\.current === submittedGeneration\) setLoading\(false\)/.test(input.dispatch)) out.push("dispatch finally rejects stale load");
  if ((input.dispatch.match(/disabled=\{loading\}/g) ?? []).length < 5) out.push("dispatch inputs and dismissal lock while pending");

  const fleetReset = input.fleet.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  if (!fleetReset.includes('setDriverId("")') || !fleetReset.includes("setError(null)")) out.push("fleet resets driver and error");
  if (!/\[open, companyId, target\?\.equipmentId, resetDraft\]/.test(input.fleet)) out.push("fleet reset keyed by company/equipment/open");
  if (!/const handleClose = useCallback\(\(\) => \{[\s\S]{0,160}actionGenerationRef\.current \+= 1;[\s\S]{0,120}resetDraft\(\);\s*onClose\(\);/.test(input.fleet)) out.push("fleet dismiss retires request and resets");
  if (!/<Modal[\s\S]{0,100}open=\{open\}[\s\S]{0,100}onClose=\{handleClose\}/.test(input.fleet)) out.push("fleet modal uses reset close");
  if (!/confirmDiscardOnClose[\s\S]{0,120}isDirty=\{Boolean\(driverId\)\}/.test(input.fleet)) out.push("fleet selected driver is discard-protected");
  if (!/onRegisterAttemptClose=\{\(attemptClose\) => \{[\s\S]{0,100}attemptCloseRef\.current = attemptClose/.test(input.fleet)) out.push("fleet Cancel registers guarded close");
  if (!/variant="secondary" onClick=\{\(\) => attemptCloseRef\.current\(\)\}/.test(input.fleet)) out.push("fleet Cancel uses guarded close");
  if (!/const input = \{ driverId, generation: actionGenerationRef\.current \}/.test(input.fleet)) out.push("fleet submit snapshots driver and generation");
  if (!/await onConfirm\(input\.driverId\);[\s\S]{0,100}input\.generation !== actionGenerationRef\.current[\s\S]{0,80}handleClose\(\);/.test(input.fleet)) out.push("fleet success rejects stale target before close");
  if (!/catch \(cause\) \{[\s\S]{0,100}input\.generation !== actionGenerationRef\.current[\s\S]{0,140}setError/.test(input.fleet)) out.push("fleet error rejects stale target");
  if (!/input\.generation === actionGenerationRef\.current\) setLoading\(false\)/.test(input.fleet)) out.push("fleet finally rejects stale target");
  return out;
}

if (process.argv.includes("--selftest")) {
  const staleTrailer = { ...source, dispatch: source.dispatch.replace("setTrailerId(\"\");", "void trailerId;") };
  const staleLoad = { ...source, dispatch: source.dispatch.replace("[open, operatingCompanyId, loadId, resetDraft]", "[open, operatingCompanyId, resetDraft]") };
  const dispatchStaleSuccess = { ...source, dispatch: source.dispatch.replace("if (scopeGenerationRef.current !== submittedGeneration) return;", "void submittedGeneration;") };
  const dispatchMutablePayload = { ...source, dispatch: source.dispatch.replace("await submittedOnSubmit(submittedPayload);", "await onSubmit({ driver_id: driverId, acknowledged_warnings: hardWarnings });") };
  const dispatchUnlocked = { ...source, dispatch: source.dispatch.replace("disabled={loading}", "disabled={false}") };
  const staleEquipment = { ...source, fleet: source.fleet.replace("[open, companyId, target?.equipmentId, resetDraft]", "[open, companyId, resetDraft]") };
  const staleSuccess = { ...source, fleet: source.fleet.replace("if (input.generation !== actionGenerationRef.current) return;\n            handleClose();", "handleClose();") };
  const staleError = { ...source, fleet: source.fleet.replace("if (input.generation !== actionGenerationRef.current) return;\n            setError", "setError") };
  const bypassCancel = { ...source, fleet: source.fleet.replace("onClick={() => attemptCloseRef.current()}", "onClick={handleClose}") };
  const checks = [
    failures(staleTrailer).includes('dispatch reset setTrailerId("")'),
    failures(staleLoad).includes("dispatch reset keyed by company/load/open"),
    failures(dispatchStaleSuccess).includes("dispatch success rejects stale load before close"),
    failures(dispatchMutablePayload).includes("dispatch success rejects stale load before close"),
    failures(dispatchUnlocked).includes("dispatch inputs and dismissal lock while pending"),
    failures(staleEquipment).includes("fleet reset keyed by company/equipment/open"),
    failures(staleSuccess).includes("fleet success rejects stale target before close"),
    failures(staleError).includes("fleet error rejects stale target"),
    failures(bypassCancel).includes("fleet Cancel uses guarded close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-quick-assign-draft-lifecycle selftest PASS — 9/9 stale assignment mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-quick-assign-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-quick-assign-draft-lifecycle PASS — Dispatch/Fleet Quick Assign drafts reset per load/equipment/company/open cycle");
