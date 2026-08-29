#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["connectivity","qbo_chrome"],"leaves":["fuel.modal.import_fuel_transactions","fuel.modal.upload_loves_prices"],"task":"CLASS-F6530-FUEL-UPLOAD-ASYNC-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  transactions: "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  prices: "apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];
  for (const [key, text] of Object.entries(input)) {
    if (!/const submissionGeneration = lifecycleGenerationRef\.current;\s*setLoading\(true\);/.test(text)) out.push(`${key} captures request generation`);
    if (!/const res = await [^;]+;\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;/.test(text)) out.push(`${key} stale success is inert`);
    if (!/catch \(error\) \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;/.test(text)) out.push(`${key} stale failure is inert`);
    if (!/finally \{\s*if \(lifecycleGenerationRef\.current === submissionGeneration\) setLoading\(false\);/.test(text)) out.push(`${key} stale request cannot clear loading`);
    if (!/const completeClose = useCallback\([\s\S]*?lifecycleGenerationRef\.current \+= 1;\s*setLoading\(false\);/.test(text)) out.push(`${key} completed lifecycle invalidates request`);
    if (!/const handleClose = useCallback\(\(\) => \{\s*if \(loading\) return;\s*completeClose\(\);\s*\}, \[completeClose, loading\]\);/.test(text)) out.push(`${key} pending upload can be dismissed`);
    if (!/<Modal open=\{open\} onClose=\{handleClose\}[^>]*confirmDiscardOnClose[^>]*isDirty=\{Boolean\(file\)\}[^>]*onRegisterAttemptClose=\{\(next\) => setAttemptClose\(\(\) => next\)\}/.test(text) || !/variant="secondary" onClick=\{attemptClose\} disabled=\{loading\}/.test(text)) out.push(`${key} selected file is not safely confirm-protected across dismiss paths`);
  }
  if (!/onImported\(\);\s*if \(res\.dead_letters === 0\) completeClose\(\);/.test(input.transactions)) {
    out.push("transactions current success refreshes and only clean imports close");
  }
  if (!/setEtag\(res\.etag\);[\s\S]*?onUploaded\(\);\s*completeClose\(\);/.test(input.prices)) out.push("prices current success refreshes and closes");
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = failures();
  if (baseline.length) {
    console.error(`verify-fuel-upload-async-lifecycle selftest BASELINE FAIL — ${baseline.join(", ")}`);
    process.exit(1);
  }
  const staleImport = { ...source, transactions: source.transactions.replace("if (lifecycleGenerationRef.current !== submissionGeneration) return;", "void submissionGeneration;") };
  const staleFailure = { ...source, prices: source.prices.replace("catch (error) {\n      if (lifecycleGenerationRef.current !== submissionGeneration) return;", "catch (error) {\n      void submissionGeneration;") };
  const staleFinally = { ...source, prices: source.prices.replace("if (lifecycleGenerationRef.current === submissionGeneration) setLoading(false);", "setLoading(false);") };
  const pendingDismiss = { ...source, transactions: source.transactions.replace("if (loading) return;", "void loading;") };
  const rawDismiss = { ...source, prices: source.prices.replace("confirmDiscardOnClose", "") };
  const rawCancel = { ...source, transactions: source.transactions.replace("onClick={attemptClose} disabled={loading}", "onClick={handleClose}") };
  const hidesRejectedRows = { ...source, transactions: source.transactions.replace("if (res.dead_letters === 0) completeClose();", "completeClose();") };
  const checks = [
    ["stale success", failures(staleImport).includes("transactions stale success is inert")],
    ["stale failure", failures(staleFailure).includes("prices stale failure is inert")],
    ["stale finally", failures(staleFinally).includes("prices stale request cannot clear loading")],
    ["pending dismiss", failures(pendingDismiss).includes("transactions pending upload can be dismissed")],
    ["raw dismiss", failures(rawDismiss).includes("prices selected file is not safely confirm-protected across dismiss paths")],
    ["raw cancel", failures(rawCancel).includes("transactions selected file is not safely confirm-protected across dismiss paths")],
    ["rejected-row evidence", failures(hidesRejectedRows).includes("transactions current success refreshes and only clean imports close")],
  ];
  const missed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missed.length) {
    console.error(`verify-fuel-upload-async-lifecycle selftest FAIL — missed ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-fuel-upload-async-lifecycle selftest PASS — 7/7 upload lifecycle mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fuel-upload-async-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fuel-upload-async-lifecycle PASS — both Fuel uploads isolate async results per company/open cycle");
