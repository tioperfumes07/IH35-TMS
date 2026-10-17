#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit","driver","connectivity","qbo_chrome","reverse_link"],"leaves":["roster.row.edit_unit","unit.edit.identity","unit.edit.insurance","unit.edit.irp_plates","unit.edit.reefer","unit.edit.financial","unit.edit.lifecycle","unit.edit.quick_availability","unit.edit.documents","fleet.modal.edit_vehicle"],"task":"CLASS-F6524-EDIT-VEHICLE-RECORD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";
const source = fs.readFileSync(file, "utf8");

// 443.187 (CC-2) repoint — REG-025/026 (8205a9d94e, #21604) moved the editor into ParityDrawer with a dirty-discard confirm:
// Cancel now calls the drawer's registered attemptClose, which (after the confirm) calls the drawer's onClose =
// resetAndClose. Same rule — Cancel resets the record draft — accepted in either form, never a bare onClose.
function cancelResets(input) {
  if (/variant="secondary" onClick=\{resetAndClose\}/.test(input)) return true;
  return /variant="secondary" onClick=\{\(\) => attemptCloseRef\.current\(\)\}/.test(input)
    && /onRegisterAttemptClose=\{\(attemptClose\) => \{\s*attemptCloseRef\.current = attemptClose;/.test(input)
    && /<ParityDrawer[\s\S]{0,200}onClose=\{resetAndClose\}/.test(input);
}

function failures(input = source) {
  return [
    ["initialization lock resets per unit/company/open", /initializedRef\.current = false;\s*setActiveTab\("Identity"\);\s*setDraft\(\{\}\);\s*setBaseline\(\{\}\);\s*\}, \[open, unitId, operatingCompanyId\]\);/.test(input)],
    ["record query is unit and company scoped", /queryKey: \["edit-vehicle-modal", unitId, operatingCompanyId\]/.test(input) && input.includes("units/${unitId}?operating_company_id=")],
    ["dismiss resets unit draft and tab", /const resetAndClose = useCallback\(\(\) => \{[\s\S]{0,140}?initializedRef\.current = false;\s*setActiveTab\("Identity"\);\s*setDraft\(\{\}\);\s*setBaseline\(\{\}\);\s*onClose\(\);/.test(input)],
    ["modal cancel no-change and success use reset close", input.includes('onClose={resetAndClose}') && cancelResets(input) && /Object\.keys\(patchPayload\)\.length === 0\) \{\s*resetAndClose\(\);/.test(input) && /onSaved\?\.\(\);\s*resetAndClose\(\);/.test(input)],
    ["canonical submitted scoped patch remains", /patchUnit\(input\.unitId, input\.companyId, input\.patch\)/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleRecord = source.replace("[open, unitId, operatingCompanyId]", "[open]");
  const staleDraft = source.replace("setDraft({});", "void draft;");
  const bypassCancel = source.replace('variant="secondary" onClick={resetAndClose}', 'variant="secondary" onClick={onClose}').replace('onClick={() => attemptCloseRef.current()}', 'onClick={onClose}');
  const checks = [
    failures(staleRecord).includes("initialization lock resets per unit/company/open"),
    failures(staleDraft).includes("initialization lock resets per unit/company/open"),
    failures(bypassCancel).includes("modal cancel no-change and success use reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-edit-vehicle-record-lifecycle selftest PASS — 3/3 stale-record/draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-edit-vehicle-record-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-edit-vehicle-record-lifecycle PASS — edit draft is isolated per unit/company/open cycle");
