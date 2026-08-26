#!/usr/bin/env node
/** @matrix-built {"modules":["drivers","fleet"],"cols":["driver","unit","connectivity","reverse_link"],"leaves":["drivers.modal.assign_truck","unit.profile.driver_assign"],"task":"CLASS-F6515-ASSIGN-TRUCK-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  return [
    ["reset unit and error", reset.includes('setUnitId("")') && reset.includes('setError("")')],
    ["reset on open/company/driver change", /if \(open\) resetDraft\(\);\s*\}, \[open, companyId, driverId, resetDraft\]\);/.test(input)],
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["modal dismiss uses reset close", input.includes('<Modal open={open} onClose={handleClose}')],
    ["cancel uses reset close", /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["successful assignment resets", /await setDriverDefaultTruck\(driverId, companyId, unitId\);\s*onAssigned\?\.\(\);\s*handleClose\(\);/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleUnit = source.replace('setUnitId("");', "void unitId;");
  const staleDriver = source.replace("[open, companyId, driverId, resetDraft]", "[open, companyId, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}');
  const checks = [
    failures(staleUnit).includes("reset unit and error"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-assign-truck-draft-lifecycle selftest PASS — 3/3 stale driver/unit mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-assign-truck-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-assign-truck-draft-lifecycle PASS — Assign Truck resets per driver/company/open cycle and every dismiss");
