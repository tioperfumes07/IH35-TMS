#!/usr/bin/env node
/**
 * verify-saf-action-mutation-error-wave5
 * SAF-ACTION-MUTATION-SILENT-FAIL-WAVE5 — DOTCompliance dismiss, RTD Clearinghouse
 * report, driver-vendor scan, fine→liability convert must surface isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-action-mutation-error-wave5";
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx",
    needles: ["userFacingApiError", "acknowledgeMutation.isError", "dot-compliance-dismiss-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/ReturnToDuty.tsx",
    needles: ["userFacingApiError", "reportMutation.isError", "rtd-clearinghouse-report-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/integrity-reports/DriverVendorMappingTab.tsx",
    needles: ["userFacingApiError", "scanMutation.isError", "driver-vendor-scan-error"],
  },
  {
    file: "apps/frontend/src/pages/safety/FinesPage.tsx",
    needles: ["userFacingApiError", "convertError", "fine-convert-liability-error"],
  },
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => acknowledgeMutation.mutate("x")}`;
  const good = CHECKS[0].needles.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-saf-wave5-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-saf-wave5-selftest.tsx", ["acknowledgeMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-saf-wave5-selftest.tsx", CHECKS[0].needles).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const c of CHECKS) {
  if (!fs.existsSync(path.join(process.cwd(), c.file))) {
    errors.push(`missing ${c.file}`);
    continue;
  }
  errors.push(...assertFile(c.file, c.needles));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — DOTCompliance/RTD/vendor-scan/fines-convert surface isError`);
