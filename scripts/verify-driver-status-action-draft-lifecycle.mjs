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
    ["suspend dismiss and success use reset close", source.suspend.includes('<Modal open={open} onClose={handleClose}') && /onSuspended\?\.\(\);\s*handleClose\(\);/.test(source.suspend) && /variant="secondary" onClick=\{handleClose\}/.test(source.suspend)],
    ["terminate resets reason summary date error", ['setTerminationReasonId("")', 'setSummary("")', "setEventDate(companyToday())", 'setError("")'].every((part) => terminateReset.includes(part))],
    ["terminate resets per company/driver/open", /if \(open\) resetDraft\(\);\s*\}, \[open, operatingCompanyId, driverId, resetDraft\]\);/.test(source.terminate)],
    ["terminate dismiss and success use reset close", source.terminate.includes('<Modal open={open} onClose={handleClose}') && /onTerminated\?\.\(\);\s*handleClose\(\);/.test(source.terminate) && /variant="secondary" onClick=\{handleClose\}/.test(source.terminate)],
    ["canonical status writers remain", /suspendDriver\(driverId, reason\.trim\(\)\)/.test(source.suspend) && /createSafetyEvent\(driverId, \{\s*event_type: "termination"/.test(source.terminate)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleSuspend = { ...disk, suspend: disk.suspend.replace('setReason("");', "void reason;") };
  const staleCompany = { ...disk, terminate: disk.terminate.replace("[open, operatingCompanyId, driverId, resetDraft]", "[open, driverId, resetDraft]") };
  const bypassTerminate = { ...disk, terminate: disk.terminate.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}') };
  const checks = [
    failures(staleSuspend).includes("suspend resets reason and error"),
    failures(staleCompany).includes("terminate resets per company/driver/open"),
    failures(bypassTerminate).includes("terminate dismiss and success use reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-status-action-draft-lifecycle selftest PASS — 3/3 stale status-action mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-status-action-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-status-action-draft-lifecycle PASS — suspend/terminate drafts reset across every driver/company/open cycle");
