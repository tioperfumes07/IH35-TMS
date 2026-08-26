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
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetForm\(\);\s*onClose\(\);/.test(input)],
    ["drawer dismiss uses reset close", input.includes('open={open} onClose={handleClose} title={`Create Training — ${driverName}`}')],
    ["cancel uses reset close", /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["successful create resets", /await createDriverTrainingRecord[\s\S]*?onCreated\?\.\(\);\s*handleClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleNotes = source.replace('setNotes("");', "void notes;");
  const staleDriver = source.replace("[open, companyId, driverId, resetForm]", "[open, companyId, resetForm]");
  const bypassCancel = source.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}');
  const checks = [
    failures(staleNotes).includes("complete training draft reset"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-add-training-creator-draft-lifecycle selftest PASS — 3/3 stale driver-training mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-add-training-creator-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-add-training-creator-draft-lifecycle PASS — Add Training resets per driver/company/open cycle and every dismiss");
