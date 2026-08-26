#!/usr/bin/env node
/** @matrix-built {"modules":["drivers","maintenance","dispatch"],"cols":["load","connectivity","reverse_link"],"leaves":["drivers.modal.report_issue","maintenance.driver_reports.queue","dispatch.drawer.load_detail"],"task":"CLASS-F6516-DRIVER-REPORT-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/driver/ReportIssueModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["reset complete report draft", ['setReportType("damage")', 'setDescription("")', "setPhotos([])", "setVoice(null)", "setError(null)"].every((part) => reset.includes(part))],
    ["reset on open/load change", /if \(open\) resetDraft\(\);\s*\}, \[open, loadId, resetDraft\]\);/.test(input)],
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["modal dismiss uses reset close", input.includes('<Modal open={open} onClose={handleClose}')],
    ["cancel uses reset close", /onClick=\{handleClose\}\s*disabled=\{busy\}/.test(input)],
    ["success uses reset close", /onSubmitted\?\.\(\);\s*handleClose\(\);/.test(input)],
    ["canonical load FK remains submitted", input.includes("load_id: loadId ?? null")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleFiles = source.replace("setPhotos([]);", "void photos;");
  const staleLoad = source.replace("[open, loadId, resetDraft]", "[open, resetDraft]");
  const bypassCancel = source.replace("onClick={handleClose}\n            disabled={busy}", "onClick={onClose}\n            disabled={busy}");
  const checks = [
    failures(staleFiles).includes("reset complete report draft"),
    failures(staleLoad).includes("reset on open/load change"),
    failures(bypassCancel).includes("cancel uses reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-report-draft-lifecycle selftest PASS — 3/3 stale load/file mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-report-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-report-draft-lifecycle PASS — report drafts reset per load/open cycle and every dismiss");
