#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link"],"leaves":["drivers.modal.send_message"],"task":"CLASS-F6517-SEND-MESSAGE-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/SendMessageModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["reset complete message draft", ['setMessage("")', 'setChannel("in_app")', 'setUrgency("")', 'setError("")'].every((part) => reset.includes(part))],
    ["reset on open/company/driver change", /if \(open\) resetDraft\(\);\s*\}, \[open, companyId, driverId, resetDraft\]\);/.test(input)],
    ["request snapshots driver/company/body", /const input = \{[\s\S]*driverId,[\s\S]*companyId,[\s\S]*generation: requestGenerationRef\.current,[\s\S]*body: \{/.test(input)],
    ["all async callbacks generation guarded", (input.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 3],
    ["context transition retires request", /requestGenerationRef\.current \+= 1;[\s\S]*setPending\(false\);[\s\S]*if \(open\) resetDraft\(\);/.test(input)],
    ["dirty modal confirmation", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}")],
    ["cancel uses confirm-aware close", input.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\}/.test(input)],
    ["current successful send resets", /input\.generation !== requestGenerationRef\.current\) return;[\s\S]*onSent\?\.\(\);[\s\S]*resetDraft\(\);[\s\S]*onClose\(\);/.test(input)],
    ["canonical driver/company writer remains", /sendDriverProfileMessage\(input\.driverId, input\.companyId, input\.body\)/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleChannel = source.replace('setChannel("in_app");', "void channel;");
  const staleDriver = source.replace("[open, companyId, driverId, resetDraft]", "[open, companyId, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={attemptClose}', 'variant="secondary" onClick={handleClose}');
  const staleCallback = source.replaceAll("input.generation !== requestGenerationRef.current", "false");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const checks = [
    failures(staleChannel).includes("reset complete message draft"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses confirm-aware close"),
    failures(staleCallback).includes("all async callbacks generation guarded"),
    failures(noConfirm).includes("dirty modal confirmation"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-send-message-draft-lifecycle selftest PASS — 5/5 stale/discard driver-message mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-send-message-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-send-message-draft-lifecycle PASS — message sends snapshot context, reject stale callbacks and protect dirty dismissal");
