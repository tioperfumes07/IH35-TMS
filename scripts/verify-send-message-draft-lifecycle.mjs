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
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["modal dismiss uses reset close", input.includes('<Modal open={open} onClose={handleClose}')],
    ["cancel uses reset close", /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["success uses reset close", /onSent\?\.\(\);\s*handleClose\(\);/.test(input)],
    ["canonical driver/company writer remains", /sendDriverProfileMessage\(driverId, companyId, \{/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleChannel = source.replace('setChannel("in_app");', "void channel;");
  const staleDriver = source.replace("[open, companyId, driverId, resetDraft]", "[open, companyId, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}');
  const checks = [
    failures(staleChannel).includes("reset complete message draft"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-send-message-draft-lifecycle selftest PASS — 3/3 stale driver/channel mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-send-message-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-send-message-draft-lifecycle PASS — message drafts reset per driver/company/open cycle and every dismiss");
