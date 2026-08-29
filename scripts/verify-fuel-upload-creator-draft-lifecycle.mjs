#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["fuel.modal.import_fuel_transactions","fuel.modal.upload_loves_prices"],"task":"FUEL-F6511-UPLOAD-CREATOR-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  transactions: "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  prices: "apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];
  for (const [key, text] of Object.entries(input)) {
    if (!/const resetDraft = useCallback\([\s\S]*?setFile\(null\)/.test(text)) out.push(`${key} clears selected file`);
    if (!/lifecycleGenerationRef\.current \+= 1;\s*setLoading\(false\);\s*resetDraft\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(text)) out.push(`${key} resets on open/company change`);
    if (!/const completeClose = useCallback\([\s\S]*?lifecycleGenerationRef\.current \+= 1;\s*setLoading\(false\);\s*resetDraft\(\);\s*onClose\(\);/.test(text)) out.push(`${key} resets after current success or accepted close`);
    if (!text.includes('<Modal open={open} onClose={handleClose}')) out.push(`${key} modal dismiss resets`);
    if (!/variant="secondary" onClick=\{attemptClose\} disabled=\{loading\}/.test(text)) out.push(`${key} cancel uses guarded close`);
    const successResets = key === "transactions"
      ? /onImported\(\);\s*if \(res\.dead_letters === 0\) completeClose\(\);/.test(text)
      : /onUploaded\(\);\s*completeClose\(\);/.test(text);
    if (!successResets) out.push(`${key} clean success resets while rejected-row evidence remains visible`);
  }
  if (!/const resetDraft = useCallback\(\(\) => \{\s*setFile\(null\);\s*setEtag\(null\);/.test(input.prices)) {
    out.push("prices clears company-bound ETag");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = failures();
  if (baseline.length) {
    console.error(`verify-fuel-upload-creator-draft-lifecycle selftest BASELINE FAIL — ${baseline.join(", ")}`);
    process.exit(1);
  }
  const staleFile = { ...source, transactions: source.transactions.replace("setFile(null)", "void file") };
  const staleCompany = { ...source, prices: source.prices.replace("[open, operatingCompanyId, resetDraft]", "[open, resetDraft]") };
  const staleEtag = { ...source, prices: source.prices.replace("setEtag(null);", "void etag;") };
  const hidesRejectedRows = { ...source, transactions: source.transactions.replace("if (res.dead_letters === 0) completeClose();", "completeClose();") };
  const checks = [
    failures(staleFile).includes("transactions clears selected file"),
    failures(staleCompany).includes("prices resets on open/company change"),
    failures(staleEtag).includes("prices clears company-bound ETag"),
    failures(hidesRejectedRows).includes("transactions clean success resets while rejected-row evidence remains visible"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-fuel-upload-creator-draft-lifecycle selftest PASS — 4/4 cross-entity upload mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fuel-upload-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fuel-upload-creator-draft-lifecycle PASS — both Fuel upload creators isolate files and ETags per company/open cycle");
