#!/usr/bin/env node
/**
 * verify-safety-b24-label-tests-mock-get-driver-labels
 * SAF-B24-LABEL-TESTS-MOCK-GET-DRIVER-LABELS — residual safety label tests must
 * spy getDriverLabels (useDriverLabels), not only listDrivers, or Selected:/attendance
 * panels render "Driver — not visible" while the picker looks fine.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-safety-b24-label-tests-mock-get-driver-labels";
const TARGETS = [
  "apps/frontend/src/pages/safety/__tests__/SafetyMeetingsPage.attendee-labels.test.tsx",
  "apps/frontend/src/pages/safety/__tests__/DrugAlcoholTab.selected-driver-label.test.tsx",
];

function assertSrc(src, file) {
  const errors = [];
  if (!/spyOn\([^,]+,\s*["']getDriverLabels["']\)/.test(src)) {
    errors.push(`${file}: must vi.spyOn(..., "getDriverLabels")`);
  }
  return errors;
}

function selftest() {
  const bad = `vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({ drivers: [] });`;
  const good = `vi.spyOn(mdataApi, "getDriverLabels").mockResolvedValue({ labels: [{ id: "d1", label: "Alex" }] });`;
  const badErrs = assertSrc(bad, "bad");
  const goodErrs = assertSrc(good, "good");
  if (badErrs.length === 0 || goodErrs.length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badErrs, goodErrs });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const rel of TARGETS) {
  const full = path.join(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    errors.push(`missing ${rel}`);
    continue;
  }
  errors.push(...assertSrc(fs.readFileSync(full, "utf8"), rel));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — SAF-B24 residual label tests mock getDriverLabels`);
