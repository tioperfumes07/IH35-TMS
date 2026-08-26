#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["drivers.modal.driver_import"],"task":"CLASS-F6520-DRIVER-IMPORT-MODAL-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/drivers/DriverImportModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["reset file preview and error", ["setFile(null)", "setPreview(null)", "setPreviewError(null)", 'fileRef.current.value = ""'].every((part) => reset.includes(part))],
    ["reset on company change", /useEffect\(\(\) => \{\s*resetDraft\(\);\s*\}, \[companyId, resetDraft\]\);/.test(input)],
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["shared Modal owns chrome", input.includes('<Modal open onClose={handleClose} title="Import drivers from Master Contacts List (CSV)" sizePreset="lg">') && !input.includes("fixed inset-0")],
    ["cancel and success use reset close", /onClick=\{handleClose\}/.test(input) && /onImported\(\);\s*handleClose\(\);/.test(input)],
    ["preview and commit stay company scoped", input.includes('importDriversCsv(file, companyId, "preview")') && input.includes('importDriversCsv(file, companyId, "commit")')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const stalePreview = source.replace("setPreview(null);", "void preview;");
  const staleCompany = source.replace("[companyId, resetDraft]", "[resetDraft]");
  const bespokeChrome = source.replace('<Modal open onClose={handleClose} title="Import drivers from Master Contacts List (CSV)" sizePreset="lg">', '<div className="fixed inset-0">');
  const checks = [
    failures(stalePreview).includes("reset file preview and error"),
    failures(staleCompany).includes("reset on company change"),
    failures(bespokeChrome).includes("shared Modal owns chrome"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-import-modal-lifecycle selftest PASS — 3/3 stale-company/chrome mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-import-modal-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-import-modal-lifecycle PASS — shared Modal and company-scoped CSV draft lifecycle");
