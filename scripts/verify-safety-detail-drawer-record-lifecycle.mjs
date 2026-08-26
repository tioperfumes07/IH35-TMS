#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","load","connectivity","qbo_chrome","reverse_link"],"leaves":["company_violations.detail","fines.detail","anomalies.detail"],"task":"CLASS-F6529-SAFETY-DETAIL-DRAWER-RECORD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  company: "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx",
  fine: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
  anomaly: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];
  if (!/const resetActionState = useCallback\(\(\) => \{\s*setOutcome\("warning"\);\s*setResolutionNotes\(""\);\s*setFineOverrideCents\(""\);\s*resetPatchMutation\(\);\s*resetCompleteMutation\(\);\s*resetEscalateMutation\(\);\s*resetResolveMutation\(\);/.test(input.company)) out.push("company resets complete action state");
  if (!/\}, \[open, operatingCompanyId, violation\?\.id, resetActionState\]\);/.test(input.company)) out.push("company reset keyed by record/company/open");
  if (!/key=\{`\$\{operatingCompanyId\}:\$\{String\(violation\.id \?\? ""\)\}`\}/.test(input.company)) out.push("corrective action child keyed by record/company");
  if (!/useEffect\(\(\) => \{\s*setConfirmOpen\(false\);\s*\}, \[open, operatingCompanyId, fine\?\.id\]\);/.test(input.fine)) out.push("fine confirmation reset keyed by record/company/open");
  if (!/const handleClose = useCallback\(\(\) => \{\s*setConfirmOpen\(false\);\s*onClose\(\);/.test(input.fine) || !input.fine.includes("onClose={handleClose}")) out.push("fine dismiss resets confirmation");
  if (!/const resetActionState = useCallback\(\(\) => \{\s*setNote\(""\);\s*resetAckMutation\(\);\s*resetResolveMutation\(\);\s*resetDismissMutation\(\);/.test(input.anomaly)) out.push("anomaly resets note and actions");
  if (!/\}, \[open, operatingCompanyId, anomalyId, resetActionState\]\);/.test(input.anomaly)) out.push("anomaly reset keyed by record/company/open");
  for (const [key, text] of Object.entries(input)) {
    if (!/useEscapeKey\(handleClose,/.test(text) || !text.includes("onClose={handleClose}")) out.push(`${key} escape and drawer dismiss share reset`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const staleCompany = { ...source, company: source.company.replace("violation?.id, resetActionState", "resetActionState") };
  const staleFine = { ...source, fine: source.fine.replace("useEffect(() => {\n    setConfirmOpen(false);", "useEffect(() => {\n    void confirmOpen;") };
  const staleAnomaly = { ...source, anomaly: source.anomaly.replace("const resetActionState = useCallback(() => {\n    setNote(\"\");", "const resetActionState = useCallback(() => {\n    void note;") };
  const checks = [
    failures(staleCompany).includes("company reset keyed by record/company/open"),
    failures(staleFine).includes("fine confirmation reset keyed by record/company/open"),
    failures(staleAnomaly).includes("anomaly resets note and actions"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-safety-detail-drawer-record-lifecycle selftest PASS — 3/3 stale record-action mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-safety-detail-drawer-record-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-detail-drawer-record-lifecycle PASS — all three Safety drawers isolate record-local actions");
