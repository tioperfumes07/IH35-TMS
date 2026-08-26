#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit","trailer","connectivity","qbo_chrome"],"leaves":["fleet.modal.edit_vehicle","fleet.modal.edit_trailer","unit.edit.identity","trailer.edit"],"task":"FLEET-F6659-EDIT-DISCARD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  unit: fs.readFileSync("apps/frontend/src/components/fleet/EditVehicleModal.tsx", "utf8"),
  trailer: fs.readFileSync("apps/frontend/src/components/fleet/EditTrailerModal.tsx", "utf8"),
};

function failures(input = files) {
  const missing = [];
  if (!/confirmDiscardOnClose[\s\S]{0,120}isDirty=\{dirtyCount > 0\}/.test(input.unit)) missing.push("unit editor no longer guards its complete dirty field count");
  if (!/confirmDiscardOnClose[\s\S]{0,160}isDirty=\{Object\.keys\(patchPayload\)\.length > 0\}/.test(input.trailer)) missing.push("trailer editor no longer guards its canonical PATCH draft");
  for (const [kind, source] of Object.entries(input)) {
    if (!/onRegisterAttemptClose=\{\(attemptClose\) => \{[\s\S]{0,100}attemptCloseRef\.current = attemptClose/.test(source)) missing.push(`${kind} editor does not register confirm-aware close`);
    if (!/<Button[^>]*variant="secondary"[^>]*onClick=\{\(\) => attemptCloseRef\.current\(\)\}/.test(source)) missing.push(`${kind} Cancel bypasses confirm-aware close`);
    if (!/onSuccess:[\s\S]{0,500}resetAndClose\(\);/.test(source)) missing.push(`${kind} current successful PATCH no longer closes directly`);
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, unit: files.unit.replace("isDirty={dirtyCount > 0}", "isDirty={false}") },
    { ...files, unit: files.unit.replace("onClick={() => attemptCloseRef.current()}", "onClick={resetAndClose}") },
    { ...files, trailer: files.trailer.replace("confirmDiscardOnClose", "") },
    { ...files, trailer: files.trailer.replace("attemptCloseRef.current = attemptClose", "void attemptClose") },
  ];
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) {
    console.error(`verify-fleet-edit-discard-lifecycle SELFTEST FAIL — ${escaped.length}/4 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-fleet-edit-discard-lifecycle selftest PASS — 4/4 planted editor-discard defects rejected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fleet-edit-discard-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
console.log("verify-fleet-edit-discard-lifecycle PASS — Unit and Trailer editors protect complete dirty PATCH drafts");
