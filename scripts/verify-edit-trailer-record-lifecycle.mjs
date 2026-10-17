#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer","connectivity","qbo_chrome","reverse_link"],"leaves":["roster.row.edit_trailer","fleet.modal.edit_trailer","trailer.edit"],"task":"CLASS-F6523-EDIT-TRAILER-RECORD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/EditTrailerModal.tsx";
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
    ["initialization lock resets per record/company/open", /initializedRef\.current = false;\s*setDraft\(\{\}\);\s*setBaseline\(\{\}\);\s*\}, \[open, trailerId, operatingCompanyId\]\);/.test(input)],
    ["record query is trailer and company scoped", /queryKey: \["edit-trailer-modal", trailerId, operatingCompanyId\]/.test(input) && input.includes("equipment/${trailerId}?operating_company_id=" )],
    ["dismiss resets record draft", /const resetAndClose = \(\) => \{[\s\S]{0,180}?initializedRef\.current = false;\s*setDraft\(\{\}\);\s*setBaseline\(\{\}\);\s*onClose\(\);/.test(input)],
    ["modal cancel no-change and success use reset close", input.includes('onClose={resetAndClose}') && cancelResets(input) && /Object\.keys\(patchPayload\)\.length === 0\) \{\s*resetAndClose\(\);/.test(input) && /onSaved\?\.\(\);\s*resetAndClose\(\);/.test(input)],
    ["canonical submitted scoped patch remains", /patchTrailer\(input\.trailerId, input\.companyId, input\.patch\)/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleRecord = source.replace("[open, trailerId, operatingCompanyId]", "[open]");
  const staleDraft = source.replace("setDraft({});", "void draft;");
  const bypassCancel = source.replace('variant="secondary" onClick={resetAndClose}', 'variant="secondary" onClick={onClose}').replace('onClick={() => attemptCloseRef.current()}', 'onClick={onClose}');
  const checks = [
    failures(staleRecord).includes("initialization lock resets per record/company/open"),
    failures(staleDraft).includes("initialization lock resets per record/company/open"),
    failures(bypassCancel).includes("modal cancel no-change and success use reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-edit-trailer-record-lifecycle selftest PASS — 3/3 stale-record/draft mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-edit-trailer-record-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-edit-trailer-record-lifecycle PASS — edit draft is isolated per trailer/company/open cycle");
