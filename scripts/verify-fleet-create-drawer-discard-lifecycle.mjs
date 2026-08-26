#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","dispatch","maintenance"],"cols":["unit","trailer","connectivity","qbo_chrome"],"leaves":["fleet.modal.create_unit","fleet.modal.create_trailer","dispatch.modal.quick_assign","maintenance.modal.create_work_order"],"task":"FLEET-F6657-CREATE-DRAWER-DISCARD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  unit: fs.readFileSync("apps/frontend/src/components/fleet/CreateUnitModal.tsx", "utf8"),
  trailer: fs.readFileSync("apps/frontend/src/components/fleet/CreateTrailerModal.tsx", "utf8"),
};

function failures(input = files) {
  const missing = [];
  for (const [kind, source] of Object.entries(input)) {
    if (!/const isDirty = \(Object\.keys\(initialDraft\)[\s\S]{0,180}draft\[key\] !== initialDraft\[key\]/.test(source)) missing.push(`${kind} does not compare the complete canonical draft`);
    if (!/<ParityDrawer[\s\S]{0,350}confirmDiscardOnClose[\s\S]{0,180}isDirty=\{isDirty\}/.test(source)) missing.push(`${kind} drawer does not enable dirty protection`);
    if (!/onRegisterAttemptClose=\{\(attemptClose\) => \{[\s\S]{0,100}attemptCloseRef\.current = attemptClose/.test(source)) missing.push(`${kind} does not register the guarded close`);
    if (!/<Button type="button" variant="secondary" onClick=\{\(\) => attemptCloseRef\.current\(\)\} disabled=\{createMutation\.isPending\}>/.test(source)) missing.push(`${kind} Cancel bypasses guarded close or stays enabled during create`);
    if (!/const handleClose = \(\) => \{\s*if \(createMutation\.isPending\) return;\s*resetAndClose\(\);\s*\};/.test(source) || !source.includes("onClose={handleClose}")) missing.push(`${kind} pending create can be dismissed`);
    if (!/onSuccess:[\s\S]{0,500}resetAndClose\(\);/.test(source)) missing.push(`${kind} current success no longer closes directly`);
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, unit: files.unit.replace("confirmDiscardOnClose", "") },
    { ...files, unit: files.unit.replace("onClick={() => attemptCloseRef.current()}", "onClick={resetAndClose}") },
    { ...files, trailer: files.trailer.replace("isDirty={isDirty}", "") },
    { ...files, trailer: files.trailer.replace("attemptCloseRef.current = attemptClose", "void attemptClose") },
    { ...files, unit: files.unit.replace("if (createMutation.isPending) return;", "void createMutation.isPending;") },
    { ...files, trailer: files.trailer.replace("disabled={createMutation.isPending}", "") },
  ];
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) {
    console.error(`verify-fleet-create-drawer-discard-lifecycle SELFTEST FAIL — ${escaped.length}/6 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-fleet-create-drawer-discard-lifecycle selftest PASS — 6/6 planted silent-discard/pending-dismiss defects rejected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fleet-create-drawer-discard-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
console.log("verify-fleet-create-drawer-discard-lifecycle PASS — unit and trailer creators preserve complete dirty drafts on dismiss");
