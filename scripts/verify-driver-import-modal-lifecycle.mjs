#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["drivers.modal.driver_import"],"task":"CLASS-F6520-DRIVER-IMPORT-MODAL-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/drivers/DriverImportModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["reset file preview and error", ["setFile(null)", "setPreview(null)", "setPreviewError(null)", 'fileRef.current.value = ""'].every((part) => reset.includes(part))],
    ["reset on company change", /useEffect\(\(\) => \{[\s\S]*?resetDraft\(\);\s*\}, \[companyId, resetDraft\]\);/.test(input)],
    ["preview and commit snapshot file/company", (input.match(/const input = \{ file, companyId, generation: requestGenerationRef\.current \}/g)?.length ?? 0) === 2],
    ["all async callbacks generation guarded", (input.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 6],
    ["company transition retires requests", /requestGenerationRef\.current \+= 1;\s*setBusy\(false\);\s*resetDraft\(\);/.test(input)],
    ["shared Modal owns confirm-aware chrome", input.includes("confirmDiscardOnClose") && input.includes("onRegisterAttemptClose") && !input.includes("fixed inset-0")],
    ["cancel uses confirm-aware close", /onClick=\{attemptClose\} disabled=\{busy\}/.test(input)],
    ["preview and commit stay company scoped", input.includes('importDriversCsv(input.file, input.companyId, "preview")') && input.includes('importDriversCsv(input.file, input.companyId, "commit")')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const stalePreview = source.replace("setPreview(null);", "void preview;");
  const staleCompany = source.replace("[companyId, resetDraft]", "[resetDraft]");
  const bespokeChrome = source.replace(/<Modal open onClose=\{handleClose\}[^>]+>/, '<div className="fixed inset-0">');
  const bypassCancel = source.replace("onClick={attemptClose} disabled={busy}", "onClick={handleClose} disabled={busy}");
  const staleCallback = source.replaceAll("input.generation !== requestGenerationRef.current", "false");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const checks = [
    failures(stalePreview).includes("reset file preview and error"),
    failures(staleCompany).includes("reset on company change"),
    failures(bespokeChrome).includes("shared Modal owns confirm-aware chrome"),
    failures(bypassCancel).includes("cancel uses confirm-aware close"),
    failures(staleCallback).includes("all async callbacks generation guarded"),
    failures(noConfirm).includes("shared Modal owns confirm-aware chrome"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-import-modal-lifecycle selftest PASS — 6/6 stale/discard import mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-import-modal-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-import-modal-lifecycle PASS — preview/commit snapshot company/file, reject stale callbacks and protect dirty dismissal");
