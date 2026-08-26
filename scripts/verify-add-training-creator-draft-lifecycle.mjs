#!/usr/bin/env node
/** @matrix-built {"modules":["drivers","safety"],"cols":["driver","connectivity","reverse_link"],"leaves":["drivers.modal.add_training","training_records.create"],"task":"CLASS-F6514-ADD-TRAINING-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/AddTrainingModal.tsx";
const source = fs.readFileSync(file, "utf8");
const RESETTERS = [
  'setTrainingName("")',
  'setCustomName("")',
  "setCompletedAt(companyToday())",
  'setExpiryDate("")',
  'setNotes("")',
  'setError("")',
];

function failures(input = source) {
  const body = input.match(/const resetForm = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["complete training draft reset", RESETTERS.every((token) => body.includes(token))],
    ["reset on open/company/driver change", /if \(open\) resetForm\(\);\s*\}, \[open, companyId, driverId, resetForm\]\);/.test(input)],
    ["request snapshots driver/company/body", /const input = \{[\s\S]*driverId,[\s\S]*companyId,[\s\S]*generation: requestGenerationRef\.current,[\s\S]*body: \{/.test(input)],
    ["all async callbacks generation guarded", (input.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 3],
    ["context transition retires request", /requestGenerationRef\.current \+= 1;[\s\S]*setPending\(false\);[\s\S]*if \(open\) resetForm\(\);/.test(input)],
    ["dirty drawer confirmation", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}")],
    ["cancel uses confirm-aware close", input.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\}/.test(input)],
    ["current successful create resets", /input\.generation !== requestGenerationRef\.current\) return;[\s\S]*onCreated\?\.\(\);[\s\S]*resetForm\(\);[\s\S]*onClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleNotes = source.replace('setNotes("");', "void notes;");
  const staleDriver = source.replace("[open, companyId, driverId, resetForm]", "[open, companyId, resetForm]");
  const bypassCancel = source.replace('variant="secondary" onClick={attemptClose}', 'variant="secondary" onClick={handleClose}');
  const staleCallback = source.replaceAll("input.generation !== requestGenerationRef.current", "false");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const checks = [
    failures(staleNotes).includes("complete training draft reset"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses confirm-aware close"),
    failures(staleCallback).includes("all async callbacks generation guarded"),
    failures(noConfirm).includes("dirty drawer confirmation"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-add-training-creator-draft-lifecycle selftest PASS — 5/5 stale/discard driver-training mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-add-training-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-add-training-creator-draft-lifecycle PASS — Add Training snapshots requests, rejects stale callbacks and protects dirty dismissal");
