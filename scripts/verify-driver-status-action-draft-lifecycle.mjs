#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link"],"leaves":["drivers.modal.suspend_confirm","drivers.modal.terminate_confirm"],"task":"CLASS-F6518-DRIVER-STATUS-ACTION-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const suspendFile = "apps/frontend/src/components/drivers/SuspendConfirmModal.tsx";
const terminateFile = "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx";
const disk = {
  suspend: fs.readFileSync(suspendFile, "utf8"),
  terminate: fs.readFileSync(terminateFile, "utf8"),
};

function failures(source = disk) {
  const suspendReset = source.suspend.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  const terminateReset = source.terminate.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["suspend resets reason and error", ['setReason("")', 'setError("")'].every((part) => suspendReset.includes(part))],
    ["suspend resets per driver/open", /if \(open\) resetDraft\(\);\s*\}, \[open, driverId, resetDraft\]\);/.test(source.suspend)],
    ["suspend snapshots request", /const input = \{ driverId, reason: reason\.trim\(\), generation: requestGenerationRef\.current \}/.test(source.suspend) && /suspendDriver\(input\.driverId, input\.reason\)/.test(source.suspend)],
    ["suspend callbacks generation guarded", (source.suspend.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 3],
    ["suspend dirty dismiss confirm-aware", source.suspend.includes("confirmDiscardOnClose") && source.suspend.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\}/.test(source.suspend)],
    ["terminate resets reason summary date error", ['setTerminationReasonId("")', 'setSummary("")', "setEventDate(companyToday())", 'setError("")'].every((part) => terminateReset.includes(part))],
    ["terminate resets per company/driver/open", /if \(open\) resetDraft\(\);\s*\}, \[open, operatingCompanyId, driverId, resetDraft\]\);/.test(source.terminate)],
    ["terminate snapshots request", /const input = \{[\s\S]*driverId,[\s\S]*generation: requestGenerationRef\.current,[\s\S]*body: \{[\s\S]*event_type: "termination" as const/.test(source.terminate) && /createSafetyEvent\(input\.driverId, input\.body\)/.test(source.terminate)],
    ["terminate callbacks generation guarded", (source.terminate.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 3],
    ["terminate dirty dismiss confirm-aware", source.terminate.includes("confirmDiscardOnClose") && source.terminate.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\}/.test(source.terminate)],
    ["canonical status writers remain", /suspendDriver\(input\.driverId, input\.reason\)/.test(source.suspend) && /createSafetyEvent\(input\.driverId, input\.body\)/.test(source.terminate)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleSuspend = { ...disk, suspend: disk.suspend.replace('setReason("");', "void reason;") };
  const staleCompany = { ...disk, terminate: disk.terminate.replace("[open, operatingCompanyId, driverId, resetDraft]", "[open, driverId, resetDraft]") };
  const bypassTerminate = { ...disk, terminate: disk.terminate.replace('variant="secondary" onClick={attemptClose}', 'variant="secondary" onClick={handleClose}') };
  const staleSuspendCallback = { ...disk, suspend: disk.suspend.replaceAll("input.generation !== requestGenerationRef.current", "false") };
  const noSuspendConfirm = { ...disk, suspend: disk.suspend.replace("confirmDiscardOnClose", "") };
  const staleTerminateCallback = { ...disk, terminate: disk.terminate.replaceAll("input.generation !== requestGenerationRef.current", "false") };
  const checks = [
    failures(staleSuspend).includes("suspend resets reason and error"),
    failures(staleCompany).includes("terminate resets per company/driver/open"),
    failures(bypassTerminate).includes("terminate dirty dismiss confirm-aware"),
    failures(staleSuspendCallback).includes("suspend callbacks generation guarded"),
    failures(noSuspendConfirm).includes("suspend dirty dismiss confirm-aware"),
    failures(staleTerminateCallback).includes("terminate callbacks generation guarded"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-status-action-draft-lifecycle selftest PASS — 6/6 stale/discard status-action mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-status-action-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-status-action-draft-lifecycle PASS — suspend/terminate snapshot requests, reject stale callbacks and protect dirty dismissal");
