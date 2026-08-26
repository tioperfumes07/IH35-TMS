#!/usr/bin/env node
/**
 * @matrix-built {"modules":["fuel"],"cols":["connectivity","qbo_chrome"],"leaves":["home"],"task":"CLASS-F6534-FUEL-FRAUD-ALERT-ACTION-LIFECYCLE","vertical":"class-sweep"}
 * Fraud-alert actions use company-snapshotted requests and the dismiss reason
 * lives in canonical product modal chrome, never a native prompt.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx";

function inspect(source) {
  const errors = [];
  if (source.includes("window.prompt")) errors.push("native dismiss prompt remains");
  if (!source.includes("<Modal") || !source.includes('title="Dismiss fuel fraud alert"')) errors.push("canonical dismiss modal missing");
  if (!source.includes("dismissReason.trim()") || !source.includes("disabled={!dismissReason.trim()}")) errors.push("dismiss reason is not required");
  if (!source.includes("confirmDiscardOnClose") || !source.includes("isDirty={Boolean(dismissReason.trim())}")) errors.push("typed dismiss reason is not discard-protected");
  if (!source.includes("onRegisterAttemptClose") || !source.includes("onClick={attemptDismissClose}")) errors.push("footer Cancel bypasses confirm-aware close");
  if (!/useEffect\(\(\) => \{[\s\S]*investigateMut\.reset\(\)[\s\S]*confirmMut\.reset\(\)[\s\S]*dismissMut\.reset\(\)[\s\S]*\}, \[companyId\]\)/.test(source)) {
    errors.push("company transition does not reset all action state");
  }
  const scopedBodies = source.match(/operating_company_id: input\.companyId/g)?.length ?? 0;
  if (scopedBodies !== 3) errors.push("all three PATCH actions must use submitting company snapshot");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 6) errors.push("all success/error callbacks must reject stale company context");
  const actionSnapshots = source.match(/companyId,[\s\S]{0,120}generation: lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (actionSnapshots < 3) errors.push("investigate/confirm/dismiss do not carry company generation");
  if (!source.includes('queryKey: ["fuel", "fraud-alerts", targetCompanyId]')) errors.push("refresh is not scoped to submitting company");
  if (!/const actionPending = investigateMut\.isPending \|\| confirmMut\.isPending \|\| dismissMut\.isPending/.test(source)) errors.push("fraud state transitions have no shared pending boundary");
  if ((source.match(/disabled=\{actionPending\}/g)?.length ?? 0) !== 3) errors.push("all three row actions must share the pending lock");
  if ((source.match(/if \(actionPending\) return;/g)?.length ?? 0) !== 3) errors.push("all three row handlers must reject concurrent transitions");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("setDismissTarget(row);", 'window.prompt("Dismiss reason");'),
    source.replace("confirmMut.reset();", "// planted: confirm reset removed"),
    source.replace("operating_company_id: input.companyId", "operating_company_id: companyId"),
    source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("confirmDiscardOnClose", ""),
    source.replace("onClick={attemptDismissClose}", "onClick={closeDismiss}"),
    source.replace("const actionPending = investigateMut.isPending || confirmMut.isPending || dismissMut.isPending", "const actionPending = false"),
    source.replace("disabled={actionPending}", "disabled={investigateMut.isPending}"),
    source.replace("if (actionPending) return;", "// planted: concurrent transition allowed"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-fuel-fraud-alert-action-lifecycle SELFTEST FAIL — ${missed.length}/9 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-fuel-fraud-alert-action-lifecycle selftest PASS — 9/9 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-fuel-fraud-alert-action-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-fuel-fraud-alert-action-lifecycle PASS — product modal and company-isolated action lifecycle are wired");
