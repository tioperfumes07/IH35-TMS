#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link"],"leaves":["safety.drawer.company_violation_detail","safety.parity.company_violation_detail"],"task":"SAFETY-F6633-COMPANY-VIOLATION-ACTION-LIFECYCLE","vertical":"column-wave"} */
import fs from "node:fs";

const files = {
  company: "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx",
  fine: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
  anomaly: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx",
  integrity: "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx",
  corrective: "apps/frontend/src/pages/safety/components/CompanyViolationCorrectiveActionForm.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];
  if (!/const resetActionState = useCallback\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*setOutcome\("warning"\);\s*setResolutionNotes\(""\);\s*setFineOverrideCents\(""\);\s*setCorrectiveActionDirty\(false\);\s*resetPatchMutation\(\);\s*resetCompleteMutation\(\);\s*resetEscalateMutation\(\);\s*resetResolveMutation\(\);/.test(input.company)) out.push("company retires and resets complete action state");
  if (!/\}, \[open, operatingCompanyId, violation\?\.id, resetActionState\]\);/.test(input.company)) out.push("company reset keyed by record/company/open");
  if (!/key=\{`\$\{operatingCompanyId\}:\$\{String\(violation\.id \?\? ""\)\}`\}/.test(input.company)) out.push("corrective action child keyed by record/company");
  if (!/updateCompanyViolation\(input\.violationId, input\.companyId, input\.payload\)/.test(input.company)) out.push("company patch snapshots record company and payload");
  if (!/completeCompanyViolationCorrectiveAction\(input\.violationId, input\.companyId, \{\s*completed_date: input\.completedDate,\s*notes: input\.notes,/.test(input.company)) out.push("corrective action snapshots record company date and notes");
  if (!/escalateCompanyViolation\(input\.violationId, input\.companyId, "Escalated from Safety UI"\)/.test(input.company)) out.push("escalation snapshots record and company");
  if (!/resolveCompanyViolation\(input\.violationId, input\.companyId, \{\s*outcome: input\.outcome,\s*resolutionNotes: input\.resolutionNotes,\s*fineAmountCentsOverride: input\.fineAmountCentsOverride,/.test(input.company)) out.push("resolution snapshots record company outcome notes and amount");
  const currentGenerationCallbacks = input.company.match(/input\.generation (?:===|!==) actionGenerationRef\.current/g)?.length ?? 0;
  if (currentGenerationCallbacks !== 4) out.push("all four company action completions reject stale records");
  if (!/const isCurrentAction = \(variables: ViolationActionScope \| undefined\) =>\s*variables\?\.violationId === currentViolationId &&\s*variables\?\.companyId === operatingCompanyId &&\s*variables\?\.generation === actionGenerationRef\.current/.test(input.company)) out.push("company action rejection scope is not bound to record company and generation");
  if (!/const actionPending = patchMutation\.isPending \|\| completeMutation\.isPending \|\| escalateMutation\.isPending \|\| resolveMutation\.isPending;\s*const handleClose = useCallback\(\(\) => \{\s*if \(actionPending\) return;/.test(input.company)) out.push("company pending actions do not lock drawer dismissal");
  if (!/confirmDiscardOnClose[\s\S]*?isDirty=\{outcome !== "warning" \|\| Boolean\(resolutionNotes\.trim\(\) \|\| fineOverrideCents\.trim\(\)\) \|\| correctiveActionDirty\}[\s\S]*?onRegisterAttemptClose=\{\(next\) => setAttemptClose\(\(\) => next\)\}/.test(input.company)) out.push("company resolution and corrective drafts lack one safe discard boundary");
  if (!/onDirtyChange=\{setCorrectiveActionDirty\}/.test(input.company)) out.push("corrective action child draft is absent from drawer dirty state");
  if (!/onDirtyChange\?\.\(completedDate !== companyToday\(\) \|\| Boolean\(notes\.trim\(\)\)\)/.test(input.corrective)) out.push("corrective action form does not report date and notes dirtiness");
  for (const mutation of ["patch", "escalate", "resolve", "complete"]) {
    if (!input.company.includes(`const ${mutation}ErrorCurrent = ${mutation}Mutation.isError && isCurrentAction(${mutation}Mutation.variables);`)) out.push(`${mutation} rejection can leak across records`);
  }
  if (!/\{\(patchErrorCurrent \|\| escalateErrorCurrent\) \? \([\s\S]*currentActionError/.test(input.company)) out.push("combined company action banner is not current-record scoped");
  if (!/\{resolveErrorCurrent \? \([\s\S]*company-violation-resolve-error/.test(input.company)) out.push("resolve banner is not current-record scoped");
  if (!/\{completeErrorCurrent \? \([\s\S]*company-violation-complete-error/.test(input.company)) out.push("corrective-action banner is not current-record scoped");
  for (const token of [
    "violationId: String(violation.id ?? \"\")",
    "companyId: operatingCompanyId",
    "generation: actionGenerationRef.current",
  ]) if (!input.company.includes(token)) out.push(`company action intent missing ${token}`);
  if (!/useEffect\(\(\) => \{\s*setConfirmOpen\(false\);\s*\}, \[open, operatingCompanyId, fine\?\.id\]\);/.test(input.fine)) out.push("fine confirmation reset keyed by record/company/open");
  if (!/const handleClose = useCallback\(\(\) => \{\s*setConfirmOpen\(false\);\s*onClose\(\);/.test(input.fine) || !input.fine.includes("onClose={handleClose}")) out.push("fine dismiss resets confirmation");
  if (!/const resetActionState = useCallback\(\(\) => \{\s*actionGenerationRef\.current \+= 1;\s*setNote\(""\);\s*resetAckMutation\(\);\s*resetResolveMutation\(\);\s*resetDismissMutation\(\);/.test(input.anomaly)) out.push("anomaly retires and resets note and actions");
  if (!/\}, \[open, operatingCompanyId, anomalyId, resetActionState\]\);/.test(input.anomaly)) out.push("anomaly reset keyed by record/company/open");
  if (!/const actionPending = ackMutation\.isPending \|\| resolveMutation\.isPending \|\| dismissMutation\.isPending;\s*const handleClose = useCallback\(\(\) => \{\s*if \(actionPending\) return;/.test(input.anomaly)) out.push("anomaly pending actions do not lock drawer dismissal");
  if (!/confirmDiscardOnClose[\s\S]*?isDirty=\{Boolean\(note\.trim\(\)\)\}[\s\S]*?onRegisterAttemptClose=\{\(next\) => setAttemptClose\(\(\) => next\)\}/.test(input.anomaly)) out.push("anomaly note lacks one safe discard boundary");
  if (!/const actionPending = ackMutation\.isPending \|\| resolveMutation\.isPending \|\| snoozeMutation\.isPending;\s*const handleClose = useCallback\(\(\) => \{\s*if \(actionPending\) return;/.test(input.integrity)) out.push("integrity pending actions do not lock drawer dismissal");
  for (const key of ["company", "anomaly", "integrity"]) {
    if (input[key].includes("useEscapeKey") || !input[key].includes("onClose={handleClose}")) out.push(`${key} must use only ParityDrawer's canonical escape/dismiss boundary`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const staleCompany = { ...source, company: source.company.replace("violation?.id, resetActionState", "resetActionState") };
  const mutablePatchCompany = { ...source, company: source.company.replace("updateCompanyViolation(input.violationId, input.companyId, input.payload)", "updateCompanyViolation(String(violation?.id ?? ''), operatingCompanyId, input.payload)") };
  const mutableResolveCompany = { ...source, company: source.company.replace("resolveCompanyViolation(input.violationId, input.companyId, {", "resolveCompanyViolation(String(violation?.id ?? ''), operatingCompanyId, {") };
  const staleCompanyCallback = { ...source, company: source.company.replace("input.generation === actionGenerationRef.current", "true") };
  const staleCompanyError = { ...source, company: source.company.replace("variables?.companyId === operatingCompanyId", "true") };
  const staleResolveBanner = { ...source, company: source.company.replace("{resolveErrorCurrent ? (", "{resolveMutation.isError ? (") };
  const staleCompleteBanner = { ...source, company: source.company.replace("{completeErrorCurrent ? (", "{completeMutation.isError ? (") };
  const staleFine = { ...source, fine: source.fine.replace("useEffect(() => {\n    setConfirmOpen(false);", "useEffect(() => {\n    void confirmOpen;") };
  const staleAnomaly = { ...source, anomaly: source.anomaly.replace("actionGenerationRef.current += 1;\n    setNote(\"\");", "void note;") };
  const pendingCompany = { ...source, company: source.company.replace("if (actionPending) return;", "void actionPending;") };
  const rawCompanyClose = { ...source, company: source.company.replace("confirmDiscardOnClose", "") };
  const missingCorrectiveDirty = { ...source, company: source.company.replace("onDirtyChange={setCorrectiveActionDirty}", "") };
  const incompleteCorrectiveDirty = { ...source, corrective: source.corrective.replace("completedDate !== companyToday() || ", "") };
  const pendingAnomaly = { ...source, anomaly: source.anomaly.replace("if (actionPending) return;", "void actionPending;") };
  const rawAnomalyClose = { ...source, anomaly: source.anomaly.replace("confirmDiscardOnClose", "") };
  const pendingIntegrity = { ...source, integrity: source.integrity.replace("if (actionPending) return;", "void actionPending;") };
  const duplicateEscape = { ...source, integrity: source.integrity.replace('import { useCallback, useEffect, useRef } from "react";', 'import { useCallback, useEffect, useRef } from "react";\nimport { useEscapeKey } from "../../../hooks/useEscapeKey";') };
  const checks = [
    failures(staleCompany).includes("company reset keyed by record/company/open"),
    failures(mutablePatchCompany).includes("company patch snapshots record company and payload"),
    failures(mutableResolveCompany).includes("resolution snapshots record company outcome notes and amount"),
    failures(staleCompanyCallback).includes("all four company action completions reject stale records"),
    failures(staleCompanyError).includes("company action rejection scope is not bound to record company and generation"),
    failures(staleResolveBanner).includes("resolve banner is not current-record scoped"),
    failures(staleCompleteBanner).includes("corrective-action banner is not current-record scoped"),
    failures(staleFine).includes("fine confirmation reset keyed by record/company/open"),
    failures(staleAnomaly).includes("anomaly retires and resets note and actions"),
    failures(pendingCompany).includes("company pending actions do not lock drawer dismissal"),
    failures(rawCompanyClose).includes("company resolution and corrective drafts lack one safe discard boundary"),
    failures(missingCorrectiveDirty).includes("corrective action child draft is absent from drawer dirty state"),
    failures(incompleteCorrectiveDirty).includes("corrective action form does not report date and notes dirtiness"),
    failures(pendingAnomaly).includes("anomaly pending actions do not lock drawer dismissal"),
    failures(rawAnomalyClose).includes("anomaly note lacks one safe discard boundary"),
    failures(pendingIntegrity).includes("integrity pending actions do not lock drawer dismissal"),
    failures(duplicateEscape).includes("integrity must use only ParityDrawer's canonical escape/dismiss boundary"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log(`verify-safety-detail-drawer-record-lifecycle selftest PASS — ${checks.length}/${checks.length} stale record-action mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-safety-detail-drawer-record-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-detail-drawer-record-lifecycle PASS — all three Safety drawers isolate record-local actions");
